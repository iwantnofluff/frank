"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface FormatDirectionInput {
  format_id: string;
  direction_text: string | null;
  caption_chars: number | null;
  sentences_min: number | null;
  sentences_max: number | null;
  artwork_lines: number | null;
  words_per_line: number | null;
  caps_rule: string | null;
}

export function useUpsertFormatDirection(agencyId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: FormatDirectionInput) => {
      const supabase = createClient();
      // Same RLS silent-zero-rows shape a plain update has — an upsert's
      // conflict-resolution path is still an update under the hood, so a
      // blocked one can "succeed" at changing nothing unless a row is
      // asked back via .select() (see useUpdateAgencyBranding for the
      // same guard). Not client-reachable today (Settings redirects
      // non-staff before this ever renders) but worth the same defense
      // in depth as everything else in this audit.
      const { data, error } = await supabase
        .from("format_directions")
        .upsert(
          { agency_id: agencyId, ...input },
          { onConflict: "agency_id,format_id" },
        )
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error("You don't have permission to edit format directions.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["format-directions", agencyId],
      });
    },
  });
}
