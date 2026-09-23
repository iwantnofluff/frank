"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface CopyVersionSummary {
  versionNo: number;
  slideText: string[];
  caption: string | null;
}

// One batch query for a whole project's creatives, not one per row — same
// shape as useProjectCreativeStats. Every version is kept (not just the
// latest) so the calendar table's Image on Text / Post Copy cells can show
// their older versions on hover, not just the current one. Ordered by
// version_no desc across all rows: within any single creative_id's own
// rows that ordering still holds regardless of how other creatives'
// rows are interleaved, so each creative's array comes out newest-first
// without a second client-side sort.
export function useCopyVersionsByCreative(creativeIds: string[]) {
  const key = [...creativeIds].sort().join(",");
  return useQuery({
    queryKey: ["copy-versions-by-creative", key],
    queryFn: async (): Promise<Record<string, CopyVersionSummary[]>> => {
      if (creativeIds.length === 0) return {};
      const supabase = createClient();
      const { data, error } = await supabase
        .from("copy_versions")
        .select("creative_id, version_no, fields, slide_text")
        .in("creative_id", creativeIds)
        .order("version_no", { ascending: false });
      if (error) throw error;

      const result: Record<string, CopyVersionSummary[]> = {};
      for (const row of data) {
        const fields = (row.fields ?? {}) as Record<string, string>;
        (result[row.creative_id] ??= []).push({
          versionNo: row.version_no,
          slideText: row.slide_text ?? [],
          caption: fields.caption ?? null,
        });
      }
      return result;
    },
    enabled: creativeIds.length > 0,
  });
}
