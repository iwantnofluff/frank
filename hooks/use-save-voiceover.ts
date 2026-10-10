"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// A video post's VO script, saved on the post itself (phase88), the way
// Text on Image is (use-save-slide-text.ts): not a copy version, and only
// if it's still what this window last knew; if someone else changed it
// meanwhile, this says who and hands back theirs rather than writing over
// it.
export class VoiceoverChangedError extends Error {
  constructor(
    public byName: string | null,
    public theirs: string,
  ) {
    super(`${byName ?? "Someone"} changed the VO while you had it open.`);
  }
}

export function useSaveVoiceover(creativeId: string, projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ voiceover, known }: { voiceover: string; known: string }) => {
      const supabase = createClient();
      const { data: now } = await supabase.from("creatives").select("voiceover, updated_by").eq("id", creativeId).maybeSingle();
      const {
        data: { user: me },
      } = await supabase.auth.getUser();
      const theirs = ((now?.voiceover as string | null) ?? "").trim();
      if (now && theirs !== known.trim() && now.updated_by !== me?.id) {
        const { data: who } = now.updated_by
          ? await supabase.from("users").select("name").eq("id", now.updated_by).maybeSingle()
          : { data: null };
        throw new VoiceoverChangedError((who?.name as string | undefined) ?? null, theirs);
      }
      // RLS returns no rows, not an error, for a blocked update.
      const { data, error } = await supabase
        .from("creatives")
        .update({ voiceover: voiceover.trim() || null })
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
