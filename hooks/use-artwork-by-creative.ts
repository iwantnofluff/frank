"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface PostArtwork {
  // The latest version's file names, in slide order.
  names: string[];
  // Its first file, for the cell's small phone (direct instruction).
  first: { storage_key: string; mime_type: string };
}

// The calendar table's "Creative" column (direct instruction): each post's
// latest creative version, its file names in slide order and its first
// file — batched for the whole project in one query, same shape as
// useLatestFeedbackByCreative. A post with no version, or whose latest
// version has no readable file, is left out.
export function useArtworkByCreative(creativeIds: string[]) {
  const key = [...creativeIds].sort().join(",");
  return useQuery({
    queryKey: ["artwork-by-creative", key],
    queryFn: async (): Promise<Record<string, PostArtwork>> => {
      if (creativeIds.length === 0) return {};
      const supabase = createClient();
      const { data, error } = await supabase
        .from("creative_versions")
        .select(
          "creative_id, version_no, asset:assets(filename, storage_key, mime_type), slides:creative_version_slides(position, asset:assets(filename, storage_key, mime_type))",
        )
        .in("creative_id", creativeIds)
        .order("version_no", { ascending: false });
      if (error) throw error;

      type File = { filename: string; storage_key: string; mime_type: string };
      type Row = {
        creative_id: string;
        asset: File | null;
        slides: { position: number; asset: File | null }[];
      };
      const result: Record<string, PostArtwork> = {};
      const seen = new Set<string>();
      for (const row of data as unknown as Row[]) {
        if (seen.has(row.creative_id)) continue;
        seen.add(row.creative_id);
        const files = row.slides?.length
          ? [...row.slides].sort((a, b) => a.position - b.position).flatMap((s) => (s.asset ? [s.asset] : []))
          : row.asset
            ? [row.asset]
            : [];
        if (files.length) {
          result[row.creative_id] = {
            names: files.map((f) => f.filename),
            first: { storage_key: files[0].storage_key, mime_type: files[0].mime_type },
          };
        }
      }
      return result;
    },
    enabled: creativeIds.length > 0,
  });
}
