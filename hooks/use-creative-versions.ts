"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { CREATIVE_VERSIONS_SELECT, type CreativeVersionRow } from "@/lib/creative-queries";

export { versionSlides, type CreativeVersionRow, type VersionAsset } from "@/lib/creative-queries";

export function useCreativeVersions(creativeId: string) {
  return useQuery({
    queryKey: ["creative-versions", creativeId],
    queryFn: async (): Promise<CreativeVersionRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("creative_versions")
        .select(CREATIVE_VERSIONS_SELECT)
        .eq("creative_id", creativeId)
        .order("version_no", { ascending: false });

      if (error) throw error;
      return data as unknown as CreativeVersionRow[];
    },
    enabled: !!creativeId,
  });
}
