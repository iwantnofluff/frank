"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface ClientRow {
  id: string;
  name: string;
  industry: string | null;
  accent_colour: string | null;
  archived_at: string | null;
}

export function useClients() {
  return useQuery({
    queryKey: ["clients"],
    queryFn: async (): Promise<ClientRow[]> => {
      const supabase = createClient();
      // RLS scopes this to the caller's agency (and, for a client-side
      // membership, to that one client) — no agency_id filter is added
      // here, the database enforces it regardless of what this query says.
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, industry, accent_colour, archived_at")
        .order("name");

      if (error) throw error;
      return data;
    },
  });
}
