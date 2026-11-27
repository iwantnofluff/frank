"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Approving a post at Client (phase170, direct instruction): the client or
// anyone on the team, from the post's comments. The database checks who may
// and that it's still at Client, moves it to Approved, records who approved
// it, and leaves the comment in their name ("Client Approved" or
// "Approved").
export function canApprovePost(c: { stage: number; archived_at?: string | null }): boolean {
  return c.stage === 4 && !c.archived_at;
}

export function useApprovePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (creativeId: string) => {
      const supabase = createClient();
      const { error } = await supabase.rpc("approve_post", { p_creative_id: creativeId });
      if (error) throw error;
      return creativeId;
    },
    // Awaited, so the stage, the comments and Client Feedback all show it
    // at once.
    onSuccess: async (creativeId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["creative", creativeId], refetchType: "all" }),
        queryClient.invalidateQueries({ queryKey: ["creatives"], refetchType: "all" }),
        queryClient.invalidateQueries({ queryKey: ["comments", creativeId] }),
        queryClient.invalidateQueries({ queryKey: ["latest-feedback-by-creative"] }),
      ]);
    },
  });
}
