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
  folder_id: string | null;
}

export function useProjects(clientId: string) {
  return useQuery({
    queryKey: ["projects", clientId],
    queryFn: async (): Promise<ProjectListRow[]> => {
      const supabase = createClient();
      // Fetches archived projects too, filtered client-side by the page —
      // same shape as use-clients.ts, so the client workspace page can
      // offer its own Active/Archived toggle rather than archiving being
      // a one-way door with nothing to see or undo it.
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, type, delivery, accent_colour, due_on, archived_at, folder_id")
        .eq("client_id", clientId)
        .order("position");

      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });
}
