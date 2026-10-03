"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "./use-current-user";

// The agency-scoped settings pages (format directions, and eventually the
// rest of Settings) assume a staff member belongs to one agency — true for
// everyone until an agency switcher exists. Prefers a staff (client_id
// null) membership if the user has more than one row.
export function useMyAgency() {
  const { data: user } = useCurrentUser();

  return useQuery({
    queryKey: ["my-agency", user?.id],
    queryFn: async (): Promise<{
      agencyId: string;
      name: string;
      clientLimit: number | null;
      seatLimit: number | null;
      plan: string;
      subdomain: string | null;
      trialEndsAt: string | null;
      storageLimit: number | null;
    } | null> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("memberships")
        .select("agency_id, client_id, agencies(name, client_limit, seat_limit, plan, subdomain, trial_ends_at, storage_limit_bytes)")
        .eq("user_id", user!.id)
        .is("removed_at", null)
        .not("accepted_at", "is", null)
        .order("client_id", { ascending: true, nullsFirst: true });

      if (error) throw error;
      if (!data || data.length === 0) return null;

      const row = data[0] as unknown as {
        agency_id: string;
        agencies: {
          name: string;
          client_limit: number | null;
          seat_limit: number | null;
          plan: string;
          subdomain: string | null;
          trial_ends_at: string | null;
          storage_limit_bytes: number | null;
        } | null;
      };
      return {
        agencyId: row.agency_id,
        name: row.agencies?.name ?? "Agency",
        // The agency's plan limit (phase37), enforced by the database.
        // null is unlimited (phase38).
        clientLimit: row.agencies?.client_limit ?? null,
        seatLimit: row.agencies?.seat_limit ?? null,
        plan: row.agencies?.plan ?? "free",
        // Its address, agencyname.beingfrank.app (phase36).
        subdomain: row.agencies?.subdomain ?? null,
        // Free's 30-day trial, and the plan's storage (phase41). null
        // storage is unlimited.
        trialEndsAt: row.agencies?.trial_ends_at ?? null,
        storageLimit: row.agencies?.storage_limit_bytes ?? null,
      };
    },
    enabled: !!user?.id,
  });
}
