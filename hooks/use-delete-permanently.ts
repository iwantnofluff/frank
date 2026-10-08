"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Deleting an archived client or project for good (phase74; Owners and the
// Primary Owner). What it would take, for the confirmation window, and the
// delete itself, through /api/delete-permanently (which also removes the
// files from storage).
export type DeleteKind = "client" | "project";

export interface DeleteCounts {
  projects: number;
  posts: number;
  comments: number;
  files: number;
  people: number;
}

export function useDeleteCounts(kind: DeleteKind, id: string) {
  return useQuery({
    queryKey: ["delete-counts", kind, id],
    queryFn: async (): Promise<DeleteCounts> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("delete_permanently_counts", { p_kind: kind, p_id: id });
      if (error) throw error;
      return data as DeleteCounts;
    },
  });
}

export function useDeletePermanently() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ kind, id }: { kind: DeleteKind; id: string }) => {
      const res = await fetch("/api/delete-permanently", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Couldn't delete it");
    },
    onSuccess: () => {
      // Lists everywhere drop it. Not waited on: the caller moves off the
      // deleted thing's page first, so nothing reloads it into an error.
      void queryClient.invalidateQueries({ refetchType: "all" });
    },
  });
}
