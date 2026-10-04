"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { InviteRole } from "@/lib/roles";

export interface InviteMemberInput {
  agencyId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: InviteRole;
  // A User's clients, or a Client's one client.
  clientIds: string[];
  // A User's or Client's projects among those clients' (phase46); null or
  // left out, all of them.
  projectIds?: string[] | null;
}

// The invite, and its link to share directly (phase44). emailError: the
// invite exists but its email didn't send — the link still works.
export interface SentInvite {
  email: string;
  name: string;
  url: string;
  emailError?: string;
}

export function useInviteMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: InviteMemberInput): Promise<SentInvite> => {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't send the invite");
      const name = [input.firstName, input.lastName].filter(Boolean).join(" ");
      return { email: input.email, name: name || input.email, url: data.url, emailError: data.emailError };
    },
    onSettled: async (_data, _error, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["team-members", input.agencyId] }),
        queryClient.invalidateQueries({ queryKey: ["staff-client-access", input.agencyId] }),
        queryClient.invalidateQueries({ queryKey: ["project-access"] }),
      ]);
    },
  });
}
