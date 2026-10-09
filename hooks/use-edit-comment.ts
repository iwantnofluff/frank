"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Editing your own comment (phase75): the words only, marked edited. Only
// its author can (the comments_body_own_only trigger); its mood for
// Analytics stays as first written (decided directly).
export function useEditComment(creativeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ commentId, body }: { commentId: string; body: string }) => {
      const supabase = createClient();
      // A blocked update returns no rows rather than an error, so the row
      // is asked back (useToggleCommentResolved does the same).
      const { data, error } = await supabase
        .from("comments")
        .update({ body: body.trim(), edited_at: new Date().toISOString() })
        .eq("id", commentId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("You can only edit your own comments.");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["comments", creativeId] }),
  });
}
