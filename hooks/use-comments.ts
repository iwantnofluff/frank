"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Anchor } from "@/lib/annotations";

export interface CommentRow {
  id: string;
  parent_id: string | null;
  author_id: string | null;
  guest_name: string | null;
  body: string;
  visibility: "private" | "public";
  anchor: Anchor | null;
  creative_version_id: string | null;
  copy_version_id: string | null;
  resolved_at: string | null;
  created_at: string;
  // When its author last changed it (phase75).
  edited_at: string | null;
  author: { name: string; avatar_asset_id: string | null } | null;
  // Whose side it came from (direct instruction: shown after the name):
  // the agency's team, or the client — its people, or a guest on a review
  // link.
  from: "agency" | "client";
}

export function useComments(creativeId: string) {
  return useQuery({
    queryKey: ["comments", creativeId],
    queryFn: async (): Promise<CommentRow[]> => {
      const supabase = createClient();

      // Fetched as a plain select, then author names resolved in a second
      // query and merged client-side — deliberately not a
      // `author:users(name)` embed. A guest comment's author_id is null,
      // and the embed syntax's join behaviour for that case turned out to
      // be the reason guest comments were invisible in the internal panel
      // even though the same rows returned correctly through the public
      // review RPC's plain SQL LEFT JOIN. Two explicit queries have no such
      // ambiguity: every row from the first query is kept, full stop.
      const { data: rows, error } = await supabase
        .from("comments")
        .select(
          "id, agency_id, parent_id, author_id, guest_name, body, visibility, anchor, creative_version_id, copy_version_id, resolved_at, created_at, edited_at",
        )
        .eq("creative_id", creativeId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const authorIds = [...new Set(rows.map((r) => r.author_id).filter((id): id is string => !!id))];
      let authorsById = new Map<string, { name: string; avatar_asset_id: string | null }>();
      // Who among them is on the agency's team (a membership with no
      // client), deactivated or not.
      const team = new Set<string>();
      if (authorIds.length > 0) {
        // Together, not one after the other (direct instruction: comments
        // should arrive at once; each request is a round trip).
        const [{ data: users, error: usersError }, { data: members, error: membersError }] = await Promise.all([
          supabase.from("users").select("id, name, avatar_asset_id").in("id", authorIds),
          supabase
            .from("memberships")
            .select("user_id")
            .eq("agency_id", rows[0].agency_id)
            .is("client_id", null)
            .in("user_id", authorIds),
        ]);
        if (usersError) throw usersError;
        if (membersError) throw membersError;
        authorsById = new Map(users.map((u) => [u.id, { name: u.name, avatar_asset_id: u.avatar_asset_id }]));
        for (const m of members) team.add(m.user_id as string);
      }

      return rows.map((r) => ({
        ...r,
        from: r.author_id && team.has(r.author_id) ? "agency" : "client",
        author: r.author_id
          ? (authorsById.get(r.author_id) ?? { name: "", avatar_asset_id: null })
          : null,
      })) as unknown as CommentRow[];
    },
    enabled: !!creativeId,
  });
}

// A comment change from the live connection, applied to the list at once
// (direct instruction: it should show on another screen immediately); the
// reload that follows fills in anything this can't know. A new comment by
// someone who's commented before takes their name and side from it; anyone
// else's shows nameless for the moment the reload takes.
export function applyLiveComment(
  list: CommentRow[] | undefined,
  eventType: "INSERT" | "UPDATE" | "DELETE",
  row: Record<string, unknown>,
): CommentRow[] | undefined {
  if (!list) return list;
  const id = row.id as string;
  if (eventType === "DELETE" || row.deleted_at) return list.filter((c) => c.id !== id);
  const fields = {
    parent_id: (row.parent_id as string | null) ?? null,
    author_id: (row.author_id as string | null) ?? null,
    guest_name: (row.guest_name as string | null) ?? null,
    body: row.body as string,
    visibility: row.visibility as CommentRow["visibility"],
    anchor: (row.anchor as CommentRow["anchor"]) ?? null,
    creative_version_id: (row.creative_version_id as string | null) ?? null,
    copy_version_id: (row.copy_version_id as string | null) ?? null,
    resolved_at: (row.resolved_at as string | null) ?? null,
    created_at: row.created_at as string,
    edited_at: (row.edited_at as string | null) ?? null,
  };
  const existing = list.find((c) => c.id === id);
  if (existing) return list.map((c) => (c.id === id ? { ...c, ...fields } : c));
  if (eventType !== "INSERT" || typeof fields.body !== "string") return list;
  // Your own comment, still showing as its placeholder (useCreateComment):
  // this is it saved, so it takes the placeholder's place, not a second one.
  const placeholder = list.find(
    (c) =>
      c.id.startsWith("pending-") &&
      c.author_id === fields.author_id &&
      c.parent_id === fields.parent_id &&
      c.body === fields.body,
  );
  if (placeholder) return list.map((c) => (c === placeholder ? { ...c, id, ...fields } : c));
  const same = fields.author_id ? list.find((c) => c.author_id === fields.author_id) : undefined;
  return [
    ...list,
    {
      id,
      ...fields,
      author: fields.author_id ? (same?.author ?? { name: "", avatar_asset_id: null }) : null,
      from: same?.from ?? (fields.author_id ? "agency" : "client"),
    },
  ];
}

