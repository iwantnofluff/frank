"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface CreativeVersionRow {
  id: string;
  version_no: number;
  note: string | null;
  created_at: string;
  asset: {
    id: string;
    storage_key: string;
    filename: string;
    mime_type: string;
  } | null;
}

export function useCreativeVersions(creativeId: string) {
  return useQuery({
    queryKey: ["creative-versions", creativeId],
    queryFn: async (): Promise<CreativeVersionRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("creative_versions")
        .select(
          "id, version_no, note, created_at, asset:assets(id, storage_key, filename, mime_type)",
        )
        .eq("creative_id", creativeId)
        .order("version_no", { ascending: false });

      if (error) throw error;
      return data as unknown as CreativeVersionRow[];
    },
    enabled: !!creativeId,
  });
}
