"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Who's looking at a review link (direct instruction): signed in to Frank
// or not, and if so whether they're on this workspace's team (not one of
// its Clients). On a workspace's address the memberships read are only
// that workspace's. A link opened signed out is the usual case: nothing
// here is needed for reviewing.
export function useReviewViewer() {
  return useQuery({
    queryKey: ["review-viewer"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ signedIn: boolean; isTeam: boolean }> => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { signedIn: false, isTeam: false };
      const { data } = await supabase
        .from("memberships")
        .select("id")
        .eq("user_id", user.id)
        .is("client_id", null)
        .is("removed_at", null)
        .not("accepted_at", "is", null)
        .limit(1);
      return { signedIn: true, isTeam: !!data?.length };
    },
  });
}
