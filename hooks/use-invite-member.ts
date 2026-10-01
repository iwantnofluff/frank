"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { InvitableRole } from "@/lib/roles";

export interface InviteMemberInput {
  agencyId: string;
  email: string;
  role: InvitableRole;
  clientIds: string[];
}

export function useInviteMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: InviteMemberInput) => {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't send the invite");
      return data.membershipId as string;
    },
    // Settled, not success: a 502 means the invite exists but its email
    // didn't send, and the Team list still has to show the new "Invited" row.
    onSettled: async (_data, _error, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["team-members", input.agencyId] }),
        queryClient.invalidateQueries({ queryKey: ["staff-client-access", input.agencyId] }),
      ]);
    },
  });
}
