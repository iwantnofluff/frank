"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "./use-current-user";
import type { AgencyRole } from "@/lib/roles";

export interface MyMembership {
  role: AgencyRole;
  client_id: string | null;
  // An Admin an Owner has let invite people (phase44).
  can_invite: boolean;
}

// client_id null = agency staff. client_id set = a client-side reviewer
// (frank-schema.docx — memberships). A Client can be on several clients,
// one membership each (phase59), so this is any one of them: what's read
// from it (Client or not, and their role) is the same for all.
export function useMyMembership(agencyId: string | undefined) {
  const { data: user } = useCurrentUser();

  return useQuery({
    queryKey: ["my-membership", agencyId, user?.id],
    queryFn: async (): Promise<MyMembership | null> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("memberships")
        .select("role, client_id, can_invite")
        .eq("agency_id", agencyId!)
        .eq("user_id", user!.id)
        .is("removed_at", null)
        .not("accepted_at", "is", null)
        // A staff membership first, if there's one alongside.
        .order("client_id", { ascending: true, nullsFirst: true })
        .limit(1);

      if (error) throw error;
      return data[0] ?? null;
    },
    enabled: !!agencyId && !!user?.id,
  });
}
