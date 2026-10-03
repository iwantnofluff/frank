"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { openCheckout } from "@/lib/billing/paddle-js";
import type { BillingRow } from "@/lib/billing/rules";
import type { Interval } from "@/lib/billing/prices";

// Paying through Paddle (phase39). The agency's billing row is readable by
// its Admins and Owners only (anyone else gets null); changes go through
// /api/billing/*, which talk to Paddle.

// `poll`: after paying, until Paddle's notification has arrived.
export function useBilling(agencyId: string | undefined, poll = false) {
  return useQuery({
    queryKey: ["billing", agencyId],
    queryFn: async (): Promise<BillingRow | null> => {
      const { data, error } = await createClient().from("agency_billing").select("*").maybeSingle();
      if (error) throw error;
      return data as BillingRow | null;
    },
    enabled: !!agencyId,
    refetchInterval: poll ? 2000 : false,
  });
}

async function post<T>(path: string, body: unknown, fallback: string): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? fallback);
  return data as T;
}

// Both what an agency can use (my-agency) and Paddle's side (billing) move
// together; everything reading either has to see the new state.
export function useRefreshPlan(agencyId: string | undefined) {
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["billing", agencyId], refetchType: "all" }),
        queryClient.invalidateQueries({ queryKey: ["my-agency"], refetchType: "all" }),
      ]),
    [queryClient, agencyId],
  );
}

export function useStartCheckout(agencyId: string | undefined) {
  return useMutation({
    mutationFn: async (input: { plan: string; interval: Interval }) => {
      const { transactionId, email } = await post<{ transactionId: string; email: string | null }>(
        "/api/billing/checkout",
        { agencyId, ...input },
        "Couldn't start the checkout",
      );
      return openCheckout(transactionId, email);
    },
  });
}

export interface ChangePreview {
  kind: "upgrade" | "downgrade" | "cancel";
  dueNow?: string | null;
  recurring?: string | null;
  nextBilledAt?: string | null;
  effectiveAt?: string | null;
}

export function usePreviewChange(agencyId: string | undefined) {
  return useMutation({
    mutationFn: (input: { plan: string; interval: Interval }) =>
      post<ChangePreview>("/api/billing/change", { agencyId, ...input, preview: true }, "Couldn't work out the change"),
  });
}

export function useChangePlan(agencyId: string | undefined) {
  const refresh = useRefreshPlan(agencyId);
  return useMutation({
    mutationFn: (input: { plan: string; interval: Interval }) =>
      post("/api/billing/change", { agencyId, ...input }, "Couldn't change the plan"),
    onSuccess: refresh,
  });
}

export function useUndoPlanChange(agencyId: string | undefined) {
  const refresh = useRefreshPlan(agencyId);
  return useMutation({
    mutationFn: () => post("/api/billing/undo", { agencyId }, "Couldn't undo the change"),
    onSuccess: refresh,
  });
}

// Paddle's customer portal, in a new tab. The tab is opened by the caller
// on the click itself (a tab opened after waiting for the link is blocked
// as a pop-up), and pointed at the link once it arrives.
export function useOpenBillingPortal(agencyId: string | undefined) {
  return useMutation({
    mutationFn: async (tab: Window | null) => {
      try {
        const { url } = await post<{ url: string }>("/api/billing/portal", { agencyId }, "Couldn't open billing");
        if (tab) tab.location.href = url;
        else window.location.href = url;
      } catch (e) {
        tab?.close();
        throw e;
      }
    },
  });
}
