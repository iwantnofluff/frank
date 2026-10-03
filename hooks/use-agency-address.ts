"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

// Changing the agency's address (phase41, /api/agency/address).
export function useChangeAddress(agencyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (subdomain: string) => {
      const res = await fetch("/api/agency/address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyId, subdomain }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't change the address");
      return data as { subdomain: string; previous: string | null };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-agency"], refetchType: "all" });
    },
  });
}
