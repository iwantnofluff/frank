"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface VersionAsset {
  id: string;
  storage_key: string;
  filename: string;
  mime_type: string;
}

export interface CreativeVersionRow {
  id: string;
  version_no: number;
  note: string | null;
  created_at: string;
  asset: VersionAsset | null;
  // A carousel version's slides, in order (phase31). Empty for a single
  // image — use versionSlides() rather than reading this directly.
  slides: { position: number; asset: VersionAsset }[];
}

// Every slide of a version, in order: a carousel's own slides, or a single
// upload as its one slide.
export function versionSlides(v: CreativeVersionRow | null | undefined): { position: number; asset: VersionAsset }[] {
  if (!v) return [];
  if (v.slides?.length) return [...v.slides].sort((a, b) => a.position - b.position);
  return v.asset ? [{ position: 1, asset: v.asset }] : [];
}

export function useCreativeVersions(creativeId: string) {
  return useQuery({
    queryKey: ["creative-versions", creativeId],
    queryFn: async (): Promise<CreativeVersionRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("creative_versions")
        .select(
          "id, version_no, note, created_at, asset:assets(id, storage_key, filename, mime_type), slides:creative_version_slides(position, asset:assets(id, storage_key, filename, mime_type))",
        )
        .eq("creative_id", creativeId)
        .order("version_no", { ascending: false });

      if (error) throw error;
      return data as unknown as CreativeVersionRow[];
    },
    enabled: !!creativeId,
  });
}
