"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Deleting a comment (phase97): Owners and the Primary Owner, anyone's
// comment, its replies going with it (decided directly). Marked deleted,
// not removed, as the schema allows; every reader leaves those out. The
// comments_delete_owners_only trigger refuses anyone else.
export function useDeleteComment(creativeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (commentId: string) => {
      const supabase = createClient();
      // A blocked update returns no rows rather than an error, so the rows
      // are asked back, and the comment itself must be among them.
      const { data, error } = await supabase
        .from("comments")
        .update({ deleted_at: new Date().toISOString() })
        .or(`id.eq.${commentId},parent_id.eq.${commentId}`)
        .is("deleted_at", null)
        .select("id");
      if (error) throw error;
      if (!data?.some((row) => row.id === commentId)) throw new Error("Only Owners can delete a comment.");
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["comments", creativeId] }),
        // The table's Client Feedback column, which showed it.
        queryClient.invalidateQueries({ queryKey: ["latest-feedback-by-creative"] }),
      ]),
  });
}
