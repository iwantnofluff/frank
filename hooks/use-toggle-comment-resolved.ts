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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", creativeId] });
    },
  });
}
