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
  author: { name: string } | null;
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
          "id, parent_id, author_id, guest_name, body, visibility, anchor, creative_version_id, copy_version_id, resolved_at, created_at",
        )
        .eq("creative_id", creativeId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const authorIds = [...new Set(rows.map((r) => r.author_id).filter((id): id is string => !!id))];
      let namesById = new Map<string, string>();
      if (authorIds.length > 0) {
        const { data: users, error: usersError } = await supabase
          .from("users")
          .select("id, name")
          .in("id", authorIds);
        if (usersError) throw usersError;
        namesById = new Map(users.map((u) => [u.id, u.name]));
      }

      return rows.map((r) => ({
        ...r,
        author: r.author_id ? { name: namesById.get(r.author_id) ?? "" } : null,
      })) as unknown as CommentRow[];
    },
    enabled: !!creativeId,
  });
}
