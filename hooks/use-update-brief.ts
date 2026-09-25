"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface BriefFields {
  name: string;
  format: string;
  leadUserId: string | null;
  concept: string;
  referenceUrl: string;
  // Exactly one side is meaningful, matching the project's own delivery
  // mode (fixed at the project level, never edited here) — the caller
  // decides which, same convention as useCreateCreative.
  scheduledAt: string | null;
  destination: string | null;
  dueOn: string | null;
}

// Direct instruction: name/format/lead/schedule are now editable after
// creation too, not just concept/reference link — reverses the original
// New Brief modal's own documented scope (docs/parity-gaps.md, "Content
// Type / Format selects... changing a creative's format after creation
// isn't a decision this pass can make"), done knowingly this time.
// approach_notes lives on this same row but isn't writable through this
// hook — it's system-generated (app/api/ai/wiifm-note, re-derived from
// whatever copy version was last saved), not brief metadata a human edits.
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
          name: fields.name.trim(),
          format: fields.format,
          lead_user_id: fields.leadUserId,
          concept: fields.concept.trim() || null,
          reference_url: fields.referenceUrl.trim() || null,
          scheduled_at: fields.scheduledAt,
          destination: fields.destination,
          due_on: fields.dueOn,
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
