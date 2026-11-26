"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Approving a post's concept (phase115, direct instruction): the client or
// anyone on the team, from the post's comments or its Concept & Reference
// cell. The database checks who may and that it's still in Concept, moves
// it to In Production, and records the comment in the approver's name
// ("Client Approved Concept" or "Approved Concept").
export function canApproveConcept(c: { stage: number; concept: string | null; archived_at?: string | null }): boolean {
  return c.stage === 1 && !!c.concept?.trim() && !c.archived_at;
}

export function useApproveConcept() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (creativeId: string) => {
      const supabase = createClient();
      const { error } = await supabase.rpc("approve_concept", { p_creative_id: creativeId });
      if (error) throw error;
      return creativeId;
    },
    // Awaited, so the pill, the comments and Client Feedback all show it
    // at once wherever it was pressed.
    onSuccess: async (creativeId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["creative", creativeId] }),
        queryClient.invalidateQueries({ queryKey: ["creatives"] }),
        queryClient.invalidateQueries({ queryKey: ["comments", creativeId] }),
        queryClient.invalidateQueries({ queryKey: ["latest-feedback-by-creative"] }),
      ]);
    },
  });
}
