"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Text on Image, saved on the post itself (phase57): not a copy version,
// so it never makes a V1 on its own (direct instruction). One entry per
// slide, trailing blanks tidied by the caller (lib/slide-text.ts).
export function useSaveSlideText(creativeId: string, projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (slideText: string[]) => {
      const supabase = createClient();
      // RLS returns no rows, not an error, for a blocked update.
      const { data, error } = await supabase
        .from("creatives")
        .update({ slide_text: slideText })
        .eq("id", creativeId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("You don't have permission to edit this post.");
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["creative", creativeId] }),
        queryClient.invalidateQueries({ queryKey: ["creatives", projectId] }),
      ]);
    },
  });
}
