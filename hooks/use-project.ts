"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface ProjectRow {
  id: string;
  client_id: string;
  name: string;
  delivery: "scheduled" | "continuous";
  type: string | null;
  due_on: string | null;
  clients: { name: string } | null;
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: ["project", projectId],
    queryFn: async (): Promise<ProjectRow> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("projects")
        .select("id, client_id, name, delivery, type, due_on, clients(name)")
        .eq("id", projectId)
        .single();

      if (error) throw error;
      return data as unknown as ProjectRow;
    },
    enabled: !!projectId,
  });
}
