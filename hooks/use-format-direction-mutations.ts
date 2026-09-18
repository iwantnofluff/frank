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
      const { error } = await supabase
        .from("format_directions")
        .upsert(
          { agency_id: agencyId, ...input },
          { onConflict: "agency_id,format_id" },
        );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["format-directions", agencyId],
      });
    },
  });
}
