"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Every client's own people in the workspace (its Clients), for Team →
// Clients, which lists them beside the team's Users (direct instruction).
export interface ClientMemberRow {
  id: string;
  client_id: string;
  accepted_at: string | null;
  user: { name: string; email: string } | null;
}

export function useClientMembers(agencyId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["client-members", agencyId],
    enabled: !!agencyId && enabled,
    queryFn: async (): Promise<ClientMemberRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("memberships")
        .select("id, client_id, accepted_at, user:users!memberships_user_id_fkey(name, email)")
        .eq("agency_id", agencyId!)
        .not("client_id", "is", null)
        .is("removed_at", null);
      if (error) throw error;
      return data as unknown as ClientMemberRow[];
    },
  });
}
