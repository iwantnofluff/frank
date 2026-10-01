"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { AgencyRole } from "@/lib/roles";

export type InviteStatus =
  | { status: "not_found" | "expired" | "accepted" }
  | { status: "ok"; email: string; agencyName: string; role: AgencyRole; needsPassword: boolean };

export function useInvite(token: string) {
  return useQuery({
    queryKey: ["invite", token],
    queryFn: async (): Promise<InviteStatus> => {
      const res = await fetch("/api/invite/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok && !data.status) throw new Error("Couldn't load this invite");
      return data;
    },
    retry: false,
  });
}

export function useAcceptInvite(token: string) {
  return useMutation({
    mutationFn: async (input: { name?: string; password?: string }) => {
      const res = await fetch("/api/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...input }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't accept the invite");
      return data as { email: string; needsPassword: boolean };
    },
  });
}
