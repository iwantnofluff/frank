"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface TeamMemberRow {
  id: string;
  user_id: string;
  role: "admin" | "user" | "finance";
  client_id: string | null;
  accepted_at: string | null;
  user: { name: string; email: string } | null;
}

export function useTeamMembers(agencyId: string | undefined) {
  return useQuery({
    queryKey: ["team-members", agencyId],
    queryFn: async (): Promise<TeamMemberRow[]> => {
      const supabase = createClient();
      // memberships has two FKs to users (user_id, invited_by) — PostgREST
      // can't pick one for a bare `users(...)` embed and errors for every
      // caller, staff or client, RLS aside (PGRST201, "more than one
      // relationship was found"). Disambiguate explicitly.
      const { data, error } = await supabase
        .from("memberships")
        .select("id, user_id, role, client_id, accepted_at, user:users!memberships_user_id_fkey(name, email)")
        .eq("agency_id", agencyId!)
        .is("client_id", null) // agency staff only — client contacts aren't "the team"
        .is("removed_at", null)
        .order("role");

      if (error) throw error;
      return data as unknown as TeamMemberRow[];
    },
    enabled: !!agencyId,
  });
}
