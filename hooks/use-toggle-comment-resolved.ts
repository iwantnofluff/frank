"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

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

      if (resolve) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("comments")
          .update({ resolved_at: new Date().toISOString(), resolved_by: user?.id })
          .eq("id", commentId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("comments")
          .update({ resolved_at: null, resolved_by: null })
          .eq("id", commentId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", creativeId] });
    },
  });
}
