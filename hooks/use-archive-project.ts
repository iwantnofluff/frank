"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Archive/unarchive is the same write either direction — `archived_at`
// set or cleared. Fully reversible, so there's no separate "delete": this
// is what "delete" means for a project (see docs/parity-gaps.md).
export function useArchiveProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      archived,
    }: {
      projectId: string;
      clientId: string;
      archived: boolean;
    }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("projects")
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .eq("id", projectId)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error("You don't have permission to archive this project.");
      }
    },
    onSuccess: (_data, { projectId, clientId }) => {
      queryClient.invalidateQueries({ queryKey: ["projects", clientId] });
      queryClient.invalidateQueries({ queryKey: ["project-creative-stats", clientId] });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    },
  });
}
