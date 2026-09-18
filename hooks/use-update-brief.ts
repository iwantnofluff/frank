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
      const { error } = await supabase
        .from("creatives")
        .update({
          concept: fields.concept.trim() || null,
          reference_url: fields.referenceUrl.trim() || null,
          approach_notes: fields.approachNotes
            .map((n) => n.trim())
            .filter((n) => n.length > 0),
        })
        .eq("id", creativeId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creative", creativeId] });
    },
  });
}
