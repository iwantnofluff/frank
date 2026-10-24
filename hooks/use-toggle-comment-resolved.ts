"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { CommentRow } from "./use-comments";

export function useToggleCommentResolved(creativeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      commentId,
      resolve,
    }: {
      commentId: string;
      resolve: boolean;
    }) => {
      const supabase = createClient();

      // RLS (comments_update_own: author or staff) silently returns zero
      // rows for a blocked update rather than an error — only surfaced if
      // a row is asked back via .select() (see useUpdateAgencyBranding
      // for the same guard).
      if (resolve) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { data, error } = await supabase
          .from("comments")
          .update({ resolved_at: new Date().toISOString(), resolved_by: user?.id })
          .eq("id", commentId)
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          throw new Error("You don't have permission to resolve this comment.");
        }
      } else {
        const { data, error } = await supabase
          .from("comments")
          .update({ resolved_at: null, resolved_by: null })
          .eq("id", commentId)
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          throw new Error("You don't have permission to reopen this comment.");
        }
      }
    },
    // Shown at once, as a new comment is (useCreateComment): the card
    // turns resolved or open on the click, and back if the save fails.
    onMutate: async ({ commentId, resolve }) => {
      const key = ["comments", creativeId];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CommentRow[]>(key);
      queryClient.setQueryData<CommentRow[]>(key, (list) =>
        list?.map((c) => (c.id === commentId ? { ...c, resolved_at: resolve ? new Date().toISOString() : null } : c)),
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(["comments", creativeId], context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["comments", creativeId] });
      // Client Feedback shows only what's still open.
      void queryClient.invalidateQueries({ queryKey: ["latest-feedback-by-creative"] });
    },
  });
}
