"use client";

import { useQuery } from "@tanstack/react-query";

// The version of Frank deployed now (/api/version), looked at every five
// minutes and whenever the tab comes back into view, so an open tab knows
// when a newer one has gone live (direct instruction).
export function useDeployedVersion() {
  return useQuery({
    queryKey: ["deployed-version"],
    queryFn: async (): Promise<string | null> => {
      const res = await fetch("/api/version", { cache: "no-store" });
      if (!res.ok) return null;
      return ((await res.json()) as { version?: string }).version ?? null;
    },
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
    staleTime: 60_000,
  });
}
