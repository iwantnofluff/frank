"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Text on Image, saved on the post itself (phase57): not a copy version,
// so it never makes a V1 on its own (direct instruction). One entry per
// slide, trailing blanks tidied by the caller (lib/slide-text.ts).
//
// Saved only if it's still what this window last knew (phase82, direct
// instruction): if someone else changed it meanwhile, this says who and
// hands back theirs rather than writing over it.
export class SlideTextChangedError extends Error {
  constructor(
    public byName: string | null,
    public theirs: string[],
  ) {
    super(`${byName ?? "Someone"} changed the Text on Image while you had it open.`);
  }
}

export function useSaveSlideText(creativeId: string, projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ slideText, known }: { slideText: string[]; known: string[] }) => {
      const supabase = createClient();
      const { data: now } = await supabase.from("creatives").select("slide_text, updated_by").eq("id", creativeId).maybeSingle();
      const {
        data: { user: me },
      } = await supabase.auth.getUser();
      const theirs = (now?.slide_text as string[] | null) ?? [];
      const tidy = (a: string[]) => JSON.stringify(a.map((t) => t.trim()).filter((t, i, all) => t || all.slice(i).some(Boolean)));
      if (now && tidy(theirs) !== tidy(known) && now.updated_by !== me?.id) {
        const { data: who } = now.updated_by
          ? await supabase.from("users").select("name").eq("id", now.updated_by).maybeSingle()
          : { data: null };
        throw new SlideTextChangedError((who?.name as string | undefined) ?? null, theirs);
      }
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
