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
  // For someone who hasn't joined: their latest invite link's dates, when
  // the viewer may see them (Owners, and whoever manages the person).
  invite: { sent_at: string; expires_at: string } | null;
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
      // Whether each pending invite's link still works (direct
      // instruction: say so when someone hasn't joined).
      const pending = (data ?? []).filter((m) => !m.accepted_at).map((m) => m.id as string);
      const latest = new Map<string, { sent_at: string; expires_at: string }>();
      if (pending.length) {
        const { data: invites } = await supabase
          .from("invites")
          .select("membership_id, created_at, expires_at")
          .in("membership_id", pending)
          .is("accepted_at", null)
          .order("created_at", { ascending: true });
        for (const i of invites ?? []) latest.set(i.membership_id as string, { sent_at: i.created_at as string, expires_at: i.expires_at as string });
      }
      const rows = (data ?? []).map((m) => ({ ...m, invite: latest.get(m.id as string) ?? null }));
      // The enum's own order (admin, user, finance, primary_owner, owner) reflects
      // when each value was added, not seniority.
      return (rows as unknown as TeamMemberRow[]).sort(
        (a, b) =>
          byRoleSeniority(a.role, b.role) ||
          (a.user?.name ?? "").localeCompare(b.user?.name ?? ""),
      );
    },
    enabled: !!agencyId,
  });
}
