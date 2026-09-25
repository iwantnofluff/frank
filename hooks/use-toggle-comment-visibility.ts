"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// comments_update_own (author or staff) covers this update at the RLS
// layer already — the same trigger that forces a non-staff insert to
// 'public' (enforce_comment_visibility, supabase/seed.sql) also fires on
// update, so a client attempting this would silently no-op back to
// public regardless of what they asked for. The UI only offers this
// control to staff for exactly that reason (CommentsPanel.tsx).
export function useToggleCommentVisibility(creativeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      commentId,
      visibility,
    }: {
      commentId: string;
      visibility: "private" | "public";
    }) => {
      const supabase = createClient();
      // Same silent-zero-rows guard as every other mutation here — a
      // blocked update reads as a no-op success unless a row is asked
      // back via .select().
      const { data, error } = await supabase
        .from("comments")
        .update({ visibility })
        .eq("id", commentId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error("You don't have permission to change this comment's visibility.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", creativeId] });
    },
  });
}
