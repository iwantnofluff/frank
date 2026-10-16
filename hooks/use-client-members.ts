"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Every client's own people in the workspace (its Clients), for Team →
// Clients, which lists them beside the team's Users, and Users' own Client
// Members (direct instruction).
export interface ClientMemberRow {
  id: string;
  client_id: string;
  accepted_at: string | null;
  user: { name: string; email: string } | null;
  // For someone who hasn't joined: their latest invite link's dates (as
  // use-team-members.ts), for "Link works until…" on Users.
  invite: { sent_at: string; expires_at: string } | null;
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
      return (data ?? []).map((m) => ({ ...m, invite: latest.get(m.id as string) ?? null })) as unknown as ClientMemberRow[];
    },
  });
}
