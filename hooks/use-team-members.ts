"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { byRoleSeniority, type AgencyRole } from "@/lib/roles";

export interface TeamMemberRow {
  id: string;
  user_id: string;
  role: AgencyRole;
  client_id: string | null;
  // An Admin an Owner has let invite people (phase44).
  can_invite: boolean;
  accepted_at: string | null;
  removed_at: string | null;
  user: {
    name: string;
    email: string;
    designation: string | null;
    avatar_asset_id: string | null;
  } | null;
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
        .select("id, user_id, role, client_id, can_invite, accepted_at, removed_at, user:users!memberships_user_id_fkey(name, email, designation, avatar_asset_id)")
        .eq("agency_id", agencyId!)
        .is("client_id", null) // agency staff only — client contacts aren't "the team"
        // Deactivated members stay listed (with Reactivate); Removed ones don't.
        .is("removed_permanently_at", null);

      if (error) throw error;
      // The enum's own order (admin, user, finance, primary_owner, owner) reflects
      // when each value was added, not seniority.
      return (data as unknown as TeamMemberRow[]).sort(
        (a, b) =>
          byRoleSeniority(a.role, b.role) ||
          (a.user?.name ?? "").localeCompare(b.user?.name ?? ""),
      );
    },
    enabled: !!agencyId,
  });
}
