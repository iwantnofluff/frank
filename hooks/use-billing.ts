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

// The workspace's invoices (decided directly, 2 Nov 2026), from Paddle,
// newest first. `total` is in the currency's minor units, as Paddle gives it.
export interface Invoice {
  id: string;
  number: string;
  billedAt: string | null;
  total: string;
  currency: string;
  status: "paid" | "due" | "overdue";
}

export function useInvoices(agencyId: string | undefined) {
  return useQuery({
    queryKey: ["invoices", agencyId],
    queryFn: async (): Promise<Invoice[]> => {
      const res = await fetch(`/api/billing/invoices?agencyId=${encodeURIComponent(agencyId!)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't read your invoices");
      return data.invoices;
    },
    enabled: !!agencyId,
    retry: false,
  });
}

// One invoice's PDF, in a new tab opened on the click (as the portal is,
// below), pointed at Paddle's short-lived link once it arrives.
export function useDownloadInvoice(agencyId: string | undefined) {
  return useMutation({
    mutationFn: async ({ transactionId, tab }: { transactionId: string; tab: Window | null }) => {
      try {
        const { url } = await post<{ url: string }>("/api/billing/invoices", { agencyId, transactionId }, "Couldn't get the invoice");
        if (tab) tab.location.href = url;
        else window.location.href = url;
      } catch (e) {
        tab?.close();
        throw e;
      }
    },
  });
}

// The card the workspace pays with (decided directly, 2 Nov 2026), from its
// last successful payment. `live` false: not paying through Paddle.
export interface PaymentMethod {
  type: string; // "card", "paypal", "apple_pay", …
  brand: string | null;
  last4: string | null;
  expiry: string | null; // "01/2033"
  name: string | null;
}
export type PaymentMethodState = { live: false } | { live: true; pastDue: boolean; method: PaymentMethod | null };

export function usePaymentMethod(agencyId: string | undefined) {
  return useQuery({
    queryKey: ["payment-method", agencyId],
    queryFn: async (): Promise<PaymentMethodState> => {
      const res = await fetch(`/api/billing/payment-method?agencyId=${encodeURIComponent(agencyId!)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't read your payment method");
      return data;
    },
    enabled: !!agencyId,
    retry: false,
  });
}

// Changing the card in Paddle's checkout, over the page. Resolves "paid"
// once Paddle has it; the card shown then follows, read again until it
// changes (Paddle records the change a moment after).
export function useChangeCard(agencyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (before: string | null) => {
      const { transactionId } = await post<{ transactionId: string }>(
        "/api/billing/payment-method",
        { agencyId },
        "Couldn't start changing the card",
      );
      const result = await openCheckout(transactionId, null);
      if (result !== "paid") return result;
      for (let i = 0; i < 10; i++) {
        await queryClient.invalidateQueries({ queryKey: ["payment-method", agencyId], refetchType: "all" });
        const now = queryClient.getQueryData<PaymentMethodState>(["payment-method", agencyId]);
        const key = now?.live && now.method ? `${now.method.last4}${now.method.expiry}` : null;
        if (key !== before) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
      await queryClient.invalidateQueries({ queryKey: ["billing", agencyId], refetchType: "all" });
      await queryClient.invalidateQueries({ queryKey: ["invoices", agencyId], refetchType: "all" });
      return result;
    },
  });
}
