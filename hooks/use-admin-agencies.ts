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
  seat_limit: number;
  client_limit: number;
  ai_monthly_request_cap: number;
  created_at: string;
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
        plan: string;
        seat_limit: number;
        client_limit: number;
        ai_monthly_request_cap: number;
        suspended: boolean;
        subdomain: string;
      }>,
    ) => call<{ ok: true }>(`/api/admin/agencies/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-agencies"] });
    },
  });
}
