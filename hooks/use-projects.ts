"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface ProjectListRow {
  id: string;
  name: string;
  type: string | null;
  delivery: "scheduled" | "continuous";
  accent_colour: string | null;
  due_on: string | null;
  archived_at: string | null;
}

export function useProjects(clientId: string) {
  return useQuery({
    queryKey: ["projects", clientId],
    queryFn: async (): Promise<ProjectListRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, type, delivery, accent_colour, due_on, archived_at")
        .eq("client_id", clientId)
        .is("archived_at", null)
        .order("position");

      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });
}
