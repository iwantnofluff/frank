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
  // Project Profile (phase46).
  description: string | null;
  // An emoticon from lib/project-icons.ts, or null for the initials (phase56).
  icon: string | null;
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
        .select("id, name, type, delivery, accent_colour, due_on, archived_at, folder_id, description, icon")
        .eq("client_id", clientId)
        .order("position");

      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });
}

export interface ClientProjectRow {
  id: string;
  name: string;
  client_id: string;
}

// The live projects of several clients at once — what someone being
// invited to those clients could be put on (phase46).
export function useProjectsOfClients(clientIds: string[]) {
  const ids = [...clientIds].sort();
  return useQuery({
    queryKey: ["projects", "of-clients", ids],
    queryFn: async (): Promise<ClientProjectRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, client_id")
        .in("client_id", ids)
        .is("archived_at", null)
        .order("position");
      if (error) throw error;
      return data;
    },
    enabled: ids.length > 0,
  });
}
