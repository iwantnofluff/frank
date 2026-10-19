"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Notes for Designer, one per image (phase108, direct instruction), saved
// on the post as Text on Image is (use-save-slide-text.ts), with the same
// check: only if it's still what this window last knew, else who changed
// it and theirs, rather than writing over it.
export class SlideNotesChangedError extends Error {
  constructor(
    public byName: string | null,
    public theirs: string[],
  ) {
    super(`${byName ?? "Someone"} changed the Notes for Designer while you had them open.`);
  }
}

export function useSaveSlideNotes(creativeId: string, projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ slideNotes, known }: { slideNotes: string[]; known: string[] }) => {
      const supabase = createClient();
      const { data: now } = await supabase.from("creatives").select("slide_notes, updated_by").eq("id", creativeId).maybeSingle();
      const {
        data: { user: me },
      } = await supabase.auth.getUser();
      const theirs = (now?.slide_notes as string[] | null) ?? [];
      const tidy = (a: string[]) => JSON.stringify(a.map((t) => t.trim()).filter((t, i, all) => t || all.slice(i).some(Boolean)));
      if (now && tidy(theirs) !== tidy(known) && now.updated_by !== me?.id) {
        const { data: who } = now.updated_by
          ? await supabase.from("users").select("name").eq("id", now.updated_by).maybeSingle()
          : { data: null };
        throw new SlideNotesChangedError((who?.name as string | undefined) ?? null, theirs);
      }
      // RLS returns no rows, not an error, for a blocked update.
      const { data, error } = await supabase
        .from("creatives")
        .update({ slide_notes: slideNotes })
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
