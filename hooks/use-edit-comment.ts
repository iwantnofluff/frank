"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Editing your own comment (phase75): the words, and who it @mentions
// (phase138; someone newly mentioned is told), marked edited. Only its
// author can (the comments_body_own_only and comments_mentions_guard
// triggers); its mood for Analytics stays as first written (decided
// directly).
export function useEditComment(creativeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ commentId, body, mentions }: { commentId: string; body: string; mentions?: string[] }) => {
      const supabase = createClient();
      // A blocked update returns no rows rather than an error, so the row
      // is asked back (useToggleCommentResolved does the same).
      const { data, error } = await supabase
        .from("comments")
        .update({ body: body.trim(), edited_at: new Date().toISOString(), ...(mentions ? { mentions } : {}) })
        .eq("id", commentId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("You can only edit your own comments.");
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["comments", creativeId] }),
        // The table's Client Feedback column shows its words.
        queryClient.invalidateQueries({ queryKey: ["latest-feedback-by-creative"] }),
      ]),
  });
}
