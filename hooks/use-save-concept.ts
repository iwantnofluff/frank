"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Save Concept, References and Notes on a saved post's Brief (direct
// instruction, as Save Content is on the Content tab): the Concept and the
// reference links here (the notes have their own save), and only if the
// post is still as this window last knew it (phase82), else who changed it.
// Returns the post's new last-changed time, for the window's next save.
export class ConceptChangedError extends Error {
  constructor(public byName: string | null) {
    super(`${byName ?? "Someone"} changed this post while you had it open. Update to see what changed.`);
  }
}

export function useSaveConcept(creativeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      concept,
      referenceUrls,
      expectedUpdatedAt,
    }: {
      concept: string;
      referenceUrls: string[];
      expectedUpdatedAt: string | null;
    }): Promise<string> => {
      const supabase = createClient();
      const save = (at: string | null) => {
        let q = supabase
          .from("creatives")
          .update({ concept: concept.trim() || null, reference_urls: referenceUrls })
          .eq("id", creativeId);
        if (at) q = q.eq("updated_at", at);
        return q.select("updated_at").maybeSingle();
      };
      const { data, error } = await save(expectedUpdatedAt);
      if (error) throw error;
      if (data) return data.updated_at as string;
      // Not saved: changed since, or not theirs to change.
      const { data: now } = await supabase.from("creatives").select("updated_at, updated_by").eq("id", creativeId).maybeSingle();
      const {
        data: { user: me },
      } = await supabase.auth.getUser();
      // Their own save from another window: nothing of anyone else's to undo.
      if (now && now.updated_by === me?.id) {
        const { data: again, error: againError } = await save(now.updated_at as string);
        if (againError) throw againError;
        if (again) return again.updated_at as string;
      }
      if (now && expectedUpdatedAt && now.updated_at !== expectedUpdatedAt) {
        const { data: who } = now.updated_by
          ? await supabase.from("users").select("name").eq("id", now.updated_by).maybeSingle()
          : { data: null };
        throw new ConceptChangedError((who?.name as string | undefined) ?? null);
      }
      throw new Error("You don't have permission to edit this brief.");
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["creative", creativeId] }),
        queryClient.invalidateQueries({ queryKey: ["creatives"] }),
      ]);
    },
  });
}
