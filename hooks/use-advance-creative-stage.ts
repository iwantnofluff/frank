"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type StageDirection = "to_review" | "to_internal" | "to_approved";

// Staff-driven stage moves — Internal Review, Client Review, Approved,
// any direction from any stage (phase13_simplify_stage_pipeline.sql).
// Calls advance_creative_stage() rather than writing `stage` directly —
// the legal-move check, the staff check (redundant with creatives_update's
// RLS but explicit), and the approval bookkeeping (attribution on
// to_approved, clearing it on the way back out) all live in one place at
// the DB layer, not just in whichever buttons happen to be rendered.
export function useAdvanceCreativeStage(creativeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (direction: StageDirection) => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("advance_creative_stage", {
        p_creative_id: creativeId,
        p_direction: direction,
      });
      if (error) throw error;
      return data;
    },
    // ShareModal's eligibility warning reads useCreatives(projectId) and
    // isn't mounted at the moment a stage is advanced from this creative's
    // own page — invalidateQueries' default refetchType ("active") skips
    // queries with no current observer and only marks them stale, so the
    // cache still holds the pre-transition stage until ShareModal's own
    // mount triggers a background refetch. In between, the warning reads
    // the stale snapshot and tells staff the link "will show nothing" for
    // a creative that's actually eligible now. refetchType: "all" forces
    // the cache itself current before this resolves, mounted or not.
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["creative", creativeId],
        refetchType: "all",
      });
      await queryClient.invalidateQueries({
        queryKey: ["creatives"],
        refetchType: "all",
      });
    },
  });
}
