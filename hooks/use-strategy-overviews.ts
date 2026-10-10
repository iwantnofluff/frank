"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface StrategyOverviewRow {
  section: string;
  overview: string;
  source_hash: string;
}

// The overviews written for a client's Strategy boxes (phase83), one per
// box, with the fingerprint of what each was written from.
export function useStrategyOverviews(clientId: string) {
  return useQuery({
    queryKey: ["strategy-overviews", clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<StrategyOverviewRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("client_strategy_overviews")
        .select("section, overview, source_hash")
        .eq("client_id", clientId);
      if (error) throw error;
      return data;
    },
  });
}

// Has Frank rewrite one box's overview (app/api/ai/strategy-overview),
// which it only does when what it's written from has changed.
export function useRefreshStrategyOverview(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (section: string): Promise<string | null> => {
      const res = await fetch("/api/ai/strategy-overview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, section }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't write the overview");
      return data.overview as string | null;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["strategy-overviews", clientId] });
    },
  });
}
