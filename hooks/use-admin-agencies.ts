"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// The platform admin area's data (phase37), through /api/admin/agencies —
// which checks platform_admins on every call and reads with the service
// role. Nothing here goes to the database directly.
export interface AdminAgency {
  id: string;
  name: string;
  subdomain: string | null;
  plan: string;
  seat_limit: number | null; // null: unlimited
  client_limit: number | null;
  storage_limit_bytes: number | null; // null: unlimited (phase41)
  trial_ends_at: string | null; // Free's 30-day trial
  // The admin override, added to the plan's limits (phase42).
  extra_seats: number;
  extra_clients: number;
  extra_ai_requests: number;
  extra_storage_bytes: number;
  // Paying through Paddle: the plan is its Owner's, not the admin's.
  pays_by_card: boolean;
  // Deleting outright: staging only (ALLOW_AGENCY_DELETE).
  can_delete: boolean;
  ai_monthly_request_cap: number;
  created_at: string;
  // A plan change the agency has asked for, not yet applied (phase38).
  pending_request: { id: string; plan: string; interval: string; created_at: string } | null;
  suspended_at: string | null;
  owner: { name: string; email: string } | null;
  members: number;
  clients: number;
  posts: number;
  storage_bytes: number;
  ai_this_month: number;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong");
  return data as T;
}

export function useAdminAgencies() {
  return useQuery({
    queryKey: ["admin-agencies"],
    queryFn: async () => (await call<{ agencies: AdminAgency[] }>("/api/admin/agencies")).agencies,
  });
}

export function useCreateAgency() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; subdomain: string; ownerEmail: string }) =>
      call<{ agencyId: string; warning?: string }>("/api/admin/agencies", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-agencies"] });
    },
  });
}

export function useUpdateAgency(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      input: Partial<{
        // The admin override, on top of the plan (phase42).
        extra_seats: number;
        extra_clients: number;
        extra_ai_requests: number;
        extra_storage_bytes: number;
        suspended: boolean;
      }>,
    ) => call<{ ok: true }>(`/api/admin/agencies/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-agencies"] });
    },
  });
}

// Applies or declines an agency's plan request (phase38).
export function useHandlePlanRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, outcome }: { id: string; outcome: "applied" | "declined" }) =>
      call<{ ok: true }>(`/api/admin/plan-requests/${id}`, { method: "PATCH", body: JSON.stringify({ outcome }) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-agencies"] });
    },
  });
}

// Staging only: an agency and everything in it, and its people's accounts
// unless they're elsewhere, so the same agency and email can sign up again.
export function useDeleteAgency() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      call<{ files: number; accounts: string[] }>(`/api/admin/agencies/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-agencies"] });
    },
  });
}
