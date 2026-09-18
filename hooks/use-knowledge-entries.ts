"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface KnowledgeEntryRow {
  id: string;
  section: string;
  kind: "text" | "file" | "link" | "image";
  title: string;
  body: string | null;
  url: string | null;
  created_at: string;
}

export function useKnowledgeEntries(clientId: string) {
  return useQuery({
    queryKey: ["knowledge-entries", clientId],
    queryFn: async (): Promise<KnowledgeEntryRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("knowledge_entries")
        .select("id, section, kind, title, body, url, created_at")
        .eq("client_id", clientId)
        .order("created_at");

      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });
}
