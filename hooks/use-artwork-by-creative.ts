"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// The calendar table's "Creative" column (direct instruction): the file
// names of each post's latest creative version, in slide order — batched
// for the whole project in one query, same shape as
// useLatestFeedbackByCreative. A post with no version, or whose latest
// version has no readable file, is left out.
export function useArtworkByCreative(creativeIds: string[]) {
  const key = [...creativeIds].sort().join(",");
  return useQuery({
    queryKey: ["artwork-by-creative", key],
    queryFn: async (): Promise<Record<string, string[]>> => {
      if (creativeIds.length === 0) return {};
      const supabase = createClient();
      const { data, error } = await supabase
        .from("creative_versions")
        .select("creative_id, version_no, asset:assets(filename), slides:creative_version_slides(position, asset:assets(filename))")
        .in("creative_id", creativeIds)
        .order("version_no", { ascending: false });
      if (error) throw error;

      type Row = {
        creative_id: string;
        asset: { filename: string } | null;
        slides: { position: number; asset: { filename: string } | null }[];
      };
      const result: Record<string, string[]> = {};
      const seen = new Set<string>();
      for (const row of data as unknown as Row[]) {
        if (seen.has(row.creative_id)) continue;
        seen.add(row.creative_id);
        const names = row.slides?.length
          ? [...row.slides].sort((a, b) => a.position - b.position).flatMap((s) => (s.asset ? [s.asset.filename] : []))
          : row.asset
            ? [row.asset.filename]
            : [];
        if (names.length) result[row.creative_id] = names;
      }
      return result;
    },
    enabled: creativeIds.length > 0,
  });
}
