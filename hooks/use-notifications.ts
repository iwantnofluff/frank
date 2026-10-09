"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// One of the signed-in person's notifications: an Approved post with no
// live date whose artwork is waiting on an Owner's or Admin's decision
// (phase60), or the client commenting on or approving a post (phase80).
export interface NotificationRow {
  id: string;
  kind: "artwork_removal" | "client_comment" | "client_approval";
  // For a comment: who, and what they said.
  comment: { id: string; body: string; who: string } | null;
  created_at: string;
  read_at: string | null;
  creative: {
    id: string;
    name: string;
    format: string;
    due_on: string | null;
    approved_at: string | null;
    approved_by_name: string | null;
    project: { id: string; name: string; client: { id: string; name: string } | null } | null;
  } | null;
}

// RLS shows each person only their own.
export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: async (): Promise<NotificationRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("notifications")
        .select(
          "id, kind, comment_id, created_at, read_at, creative:creatives(id, name, format, due_on, approved_at, approved_by_name, project:projects(id, name, client:clients(id, name)))",
        )
        // Only those meant for the bell (a client may want email only).
        .eq("in_app", true)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      // The comments, and their authors' names, read plainly rather than
      // embedded (a guest's comment has no author; see use-comments.ts).
      const commentIds = data.map((n) => n.comment_id as string | null).filter((id): id is string => !!id);
      const comments = new Map<string, { id: string; body: string; who: string }>();
      if (commentIds.length) {
        const { data: rows } = await supabase.from("comments").select("id, body, guest_name, author_id").in("id", commentIds);
        const authorIds = [...new Set((rows ?? []).map((r) => r.author_id as string | null).filter((id): id is string => !!id))];
        const names = new Map<string, string>();
        if (authorIds.length) {
          const { data: users } = await supabase.from("users").select("id, name").in("id", authorIds);
          for (const u of users ?? []) names.set(u.id as string, u.name as string);
        }
        for (const r of rows ?? []) {
          comments.set(r.id as string, {
            id: r.id as string,
            body: r.body as string,
            who: (r.guest_name as string | null) ?? names.get(r.author_id as string) ?? "The client",
          });
        }
      }
      return data.map((n) => ({
        ...n,
        comment: n.comment_id ? (comments.get(n.comment_id as string) ?? null) : null,
      })) as unknown as NotificationRow[];
    },
    enabled,
    // A client's comments arrive any time (phase80): looked for every minute.
    refetchInterval: 60_000,
  });
}

// Marks some (or, with no ids, all) of my unread ones as read.
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids?: string[]) => {
      const supabase = createClient();
      let q = supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
      if (ids) q = q.in("id", ids);
      const { error } = await q;
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

async function afterDecision(queryClient: ReturnType<typeof useQueryClient>, creativeId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    queryClient.invalidateQueries({ queryKey: ["creative", creativeId] }),
    queryClient.invalidateQueries({ queryKey: ["creative-versions", creativeId] }),
    queryClient.invalidateQueries({ queryKey: ["creatives"] }),
  ]);
}

// Removing a post's artwork now (Owners and Admins): the route frees the
// files once the database has let go of them.
export function useRemoveArtworkNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (creativeId: string) => {
      const res = await fetch("/api/creatives/remove-artwork", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creativeId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error === "not permitted" ? "Only Owners and Admins can remove artwork" : (data.error ?? "Couldn't remove the artwork"));
    },
    onSettled: (_d, _e, creativeId) => afterDecision(queryClient, creativeId),
  });
}

// Keeping it for good: not asked about again.
export function useKeepArtwork() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (creativeId: string) => {
      const supabase = createClient();
      const { error } = await supabase.rpc("keep_creative_artwork", { p_creative_id: creativeId });
      if (error) throw new Error(error.message === "not permitted" ? "Only Owners and Admins can decide this" : error.message);
    },
    onSettled: (_d, _e, creativeId) => afterDecision(queryClient, creativeId),
  });
}
