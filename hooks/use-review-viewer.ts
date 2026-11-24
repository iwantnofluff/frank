"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { signedInUser } from "@/lib/supabase/signed-in-user";

// Who's looking at a review link (direct instruction): signed in to Frank
// or not, and if so whether they're on this workspace's team (not one of
// its Clients), and the clients they're a Client of. On a workspace's address the memberships read are only
// that workspace's. A link opened signed out is the usual case: nothing
// here is needed for reviewing.
export function useReviewViewer() {
  return useQuery({
    queryKey: ["review-viewer"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ signedIn: boolean; isTeam: boolean; email: string | null; clientIds: string[] }> => {
      const supabase = createClient();
      const {
        data: { user },
      } = await signedInUser(supabase);
      if (!user) return { signedIn: false, isTeam: false, email: null, clientIds: [] };
      const { data } = await supabase
        .from("memberships")
        .select("client_id")
        .eq("user_id", user.id)
        .is("removed_at", null)
        .not("accepted_at", "is", null);
      const rows = (data ?? []) as { client_id: string | null }[];
      return {
        signedIn: true,
        isTeam: rows.some((m) => m.client_id === null),
        // A Client's own clients (an account made from a link lands back on
        // it signed in, with the way to their planner; direct instruction).
        email: user.email ?? null,
        clientIds: rows.flatMap((m) => (m.client_id ? [m.client_id] : [])),
      };
    },
  });
}
