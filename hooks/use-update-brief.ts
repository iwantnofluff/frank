"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface BriefFields {
  concept: string;
  referenceUrl: string;
  approachNotes: string[];
}

// Concept and approach notes live on the creative row directly — no
// versioning, they're brief metadata rather than deliverable content.
export function useUpdateBrief(creativeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (fields: BriefFields) => {
      const supabase = createClient();
      // RLS silently returns zero rows for a blocked update rather than an
      // error — only surfaced if a row is asked back via .select(). Without
      // it, a non-staff caller's blocked save reads as a no-op "success"
      // (see useUpdateAgencyBranding for the same guard).
      const { data, error } = await supabase
        .from("creatives")
        .update({
          concept: fields.concept.trim() || null,
          reference_url: fields.referenceUrl.trim() || null,
          approach_notes: fields.approachNotes
            .map((n) => n.trim())
            .filter((n) => n.length > 0),
        })
        .eq("id", creativeId)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error("You don't have permission to edit this brief.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creative", creativeId] });
    },
  });
}
