"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// A real, irreversible delete — distinct from useArchiveCreatives, which
// only ever sets/clears archived_at. Calls delete_creatives_permanently()
// (supabase/migrations/phase21_delete_creatives_permanently.sql) rather
// than deleting client-side: comments/copy_versions cross-reference each
// other in both directions, and creatives has no delete RLS policy at
// all, so this has to happen behind a SECURITY DEFINER function either
// way.
export function useDeleteCreativesPermanently(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (creativeIds: string[]) => {
      const supabase = createClient();
      const { error } = await supabase.rpc("delete_creatives_permanently", {
        p_creative_ids: creativeIds,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creatives", projectId] });
    },
  });
}
