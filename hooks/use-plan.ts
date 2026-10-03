"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Settings → Your Plan (phase38): the agency's pending request to change
// plan, if any, and making one (/api/plan-request, which also tells Frank).
export interface PlanRequestRow {
  id: string;
  requested_plan: string;
  billing_interval: "monthly" | "annual";
  created_at: string;
}

export function usePendingPlanRequest(agencyId: string | undefined) {
  return useQuery({
    queryKey: ["plan-request", agencyId],
    queryFn: async (): Promise<PlanRequestRow | null> => {
      const { data, error } = await createClient()
        .from("plan_requests")
        .select("id, requested_plan, billing_interval, created_at")
        .is("handled_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as PlanRequestRow | null;
    },
    enabled: !!agencyId,
  });
}

export function useRequestPlan(agencyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { plan: string; interval: "monthly" | "annual" }) => {
      const res = await fetch("/api/plan-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyId, ...input }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't send the request");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["plan-request", agencyId] });
    },
  });
}
