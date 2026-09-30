"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Same convention as useArchiveClient/useArchiveProject: "delete" for a
// post means archived_at, fully reversible, not a hard delete. Bulk from
// the start (a single .in() update) since the only entry point is the
// calendar tables' checkbox-select bar, never a lone row.
export function useArchiveCreatives(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ creativeIds, archived }: { creativeIds: string[]; archived: boolean }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("creatives")
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .in("id", creativeIds)
        .select("id");

      if (error) throw error;
      // RLS silently drops blocked rows rather than erroring — a partial
      // return means some of these weren't this caller's to archive.
      if (!data || data.length !== creativeIds.length) {
        throw new Error("You don't have permission to change some of these posts.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creatives", projectId] });
    },
  });
}
