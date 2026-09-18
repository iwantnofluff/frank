"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface CreativeRow {
  id: string;
  agency_id: string;
  project_id: string;
  name: string;
  format: string;
  stage: number;
  exception: "changes_requested" | "rejected" | null;
  scheduled_at: string | null;
  platforms: string[] | null;
  destination: string | null;
  concept: string | null;
  reference_url: string | null;
  approach_notes: string[] | null;
  projects: {
    id: string;
    name: string;
    delivery: "scheduled" | "continuous";
    client_id: string;
    clients: { name: string } | null;
  } | null;
}

export function useCreative(creativeId: string) {
  return useQuery({
    queryKey: ["creative", creativeId],
    queryFn: async (): Promise<CreativeRow> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("creatives")
        .select(
          "id, agency_id, project_id, name, format, stage, exception, scheduled_at, platforms, destination, concept, reference_url, approach_notes, projects(id, name, delivery, client_id, clients(name))",
        )
        .eq("id", creativeId)
        .single();

      if (error) throw error;
      return data as unknown as CreativeRow;
    },
    enabled: !!creativeId,
  });
}
