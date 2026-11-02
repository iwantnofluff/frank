"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InvoiceDetails } from "@/lib/billing/invoice-details";

// Invoice Settings (decided directly, 2 Nov 2026): the details Paddle prints
// on this workspace's invoices, read from and saved to Paddle through
// /api/billing/invoice-details. `live` false: not paying through Paddle.
export type InvoiceDetailsState = { live: false } | { live: true; email: string; details: InvoiceDetails };

async function answer<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? fallback);
  return data as T;
}

export function useInvoiceDetails(agencyId: string | undefined) {
  return useQuery({
    queryKey: ["invoice-details", agencyId],
    queryFn: async () =>
      answer<InvoiceDetailsState>(
        await fetch(`/api/billing/invoice-details?agencyId=${encodeURIComponent(agencyId!)}`),
        "Couldn't read your invoice details",
      ),
    enabled: !!agencyId,
    retry: false,
  });
}

export function useSaveInvoiceDetails(agencyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (details: InvoiceDetails) =>
      answer<InvoiceDetailsState>(
        await fetch("/api/billing/invoice-details", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agencyId, details }),
        }),
        "Couldn't save your invoice details",
      ),
    // What Paddle now holds, as it answered.
    onSuccess: (saved) => queryClient.setQueryData(["invoice-details", agencyId], saved),
  });
}
