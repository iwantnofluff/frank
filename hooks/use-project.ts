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
  archived_at: string | null;
  // The Main Table's hidden columns, chosen when it was made (phase96).
  default_hidden_columns: string[];
  default_column_order: string[] | null;
  column_labels: Record<string, string>;
  // Who's on a new post's Team to start with (phase101).
  default_team_user_ids: string[];
  clients: { name: string } | null;
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: ["project", projectId],
    queryFn: async (): Promise<ProjectRow> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("projects")
        .select("id, client_id, name, delivery, type, due_on, archived_at, default_hidden_columns, default_column_order, column_labels, default_team_user_ids, clients(name)")
        .eq("id", projectId)
        .single();

      if (error) throw error;
      return data as unknown as ProjectRow;
    },
    enabled: !!projectId,
  });
}
