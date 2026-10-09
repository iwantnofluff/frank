"use client";

import { useQuery } from "@tanstack/react-query";

// Every workspace you belong to, for the switcher in the profile menu
// (/api/my-workspaces: on a workspace's address the database shows only
// that one, so the route reads across them for you).
export interface MyWorkspace {
  id: string;
  name: string;
  url: string;
  logoUrl: string | null;
  current: boolean;
  paused: boolean;
}

export function useMyWorkspaces(enabled: boolean) {
  return useQuery({
    queryKey: ["my-workspaces"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ switchable: boolean; workspaces: MyWorkspace[] }> => {
      const res = await fetch("/api/my-workspaces");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't load your workspaces");
      return body;
    },
  });
}
