"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Archive/unarchive is the same write either direction — `archived_at`
// set or cleared. Fully reversible, so there's no separate "delete": this
// is what "delete" means for a client (see docs/parity-gaps.md).
export function useArchiveClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ clientId, archived }: { clientId: string; archived: boolean }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("clients")
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .eq("id", clientId)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error("You don't have permission to archive this client.");
      }
    },
    onSuccess: (_data, { clientId }) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["client", clientId] });
    },
  });
}
