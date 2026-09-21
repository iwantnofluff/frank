"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type StageDirection = "to_review" | "to_internal";

// The only stage transition built so far (docs/parity-gaps.md, "Stage
// transitions — scoped, not built"): internal band -> Client Review, and
// back. Calls advance_creative_stage() rather than writing `stage`
// directly — the legal-move check (and the staff check, redundant with
// creatives_update's RLS but explicit) lives in one place at the DB
// layer, not just in whichever buttons happen to be rendered.
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creative", creativeId] });
      queryClient.invalidateQueries({ queryKey: ["creatives"] });
    },
  });
}
