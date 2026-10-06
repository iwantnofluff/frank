"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// One of the signed-in person's notifications (phase60). Only one kind so
// far: an Approved post with no live date whose artwork is waiting on an
// Owner's or Admin's decision.
export interface NotificationRow {
  id: string;
  kind: "artwork_removal";
  created_at: string;
  read_at: string | null;
  creative: {
    id: string;
    name: string;
    format: string;
    due_on: string | null;
    approved_at: string | null;
    project: { id: string; name: string; client: { name: string } | null } | null;
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
          "id, kind, created_at, read_at, creative:creatives(id, name, format, due_on, approved_at, project:projects(id, name, client:clients(name)))",
        )
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as NotificationRow[];
    },
    enabled,
    // New ones arrive from the daily run; looked for again now and then.
    refetchInterval: 5 * 60_000,
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
