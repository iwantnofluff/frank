"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface FormatDirectionRow {
  id: string;
  format_id: string;
  direction_text: string | null;
  caption_chars: number | null;
  sentences_min: number | null;
  sentences_max: number | null;
  artwork_lines: number | null;
  words_per_line: number | null;
  caps_rule: string | null;
}

export function useFormatDirections(agencyId: string | undefined) {
  return useQuery({
    queryKey: ["format-directions", agencyId],
    queryFn: async (): Promise<FormatDirectionRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("format_directions")
        .select(
          "id, format_id, direction_text, caption_chars, sentences_min, sentences_max, artwork_lines, words_per_line, caps_rule",
        )
        .eq("agency_id", agencyId!)
        .order("format_id");

      if (error) throw error;
      return data;
    },
    enabled: !!agencyId,
  });
}
