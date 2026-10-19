"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// A post's date (and time) changed straight from a project's table (direct
// instruction): its Publish Date for a scheduled project, its Live Date for
// a continuous one, and nothing else, so it can't overwrite a field someone
// else changed meanwhile. Null takes the date off, making the post an
// Idea. A blocked update returns no row rather than an error, so the row is
// asked back to be sure it landed.
export function useReschedulePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      creativeId,
      ...change
    }: { creativeId: string } & ({ scheduledAt: string | null } | { dueOn: string | null })) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("creatives")
        .update("scheduledAt" in change ? { scheduled_at: change.scheduledAt } : { due_on: change.dueOn })
        .eq("id", creativeId)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("You don't have permission to change this post's date.");
    },
    onSuccess: async (_d, { creativeId }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["creatives"] }),
        queryClient.invalidateQueries({ queryKey: ["creative", creativeId] }),
      ]);
    },
  });
}
