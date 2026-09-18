"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface CopyVersionRow {
  id: string;
  version_no: number;
  fields: Record<string, string>;
  slide_text: string[] | null;
  source: "upload" | "accepted_edit" | "in_app_edit";
  created_at: string;
}

export function useCopyVersions(creativeId: string) {
  return useQuery({
    queryKey: ["copy-versions", creativeId],
    queryFn: async (): Promise<CopyVersionRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("copy_versions")
        .select("id, version_no, fields, slide_text, source, created_at")
        .eq("creative_id", creativeId)
        .order("version_no", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!creativeId,
  });
}
