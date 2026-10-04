"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// The admin area acting inside an agency, and its log (phase51), through
// /api/admin, which checks platform_admins on every call.
export interface AdminActionEntry {
  id: string;
  actor_name: string;
  action: string;
  target: string | null;
  detail: string | null;
  reason: string;
  created_at: string;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong");
  return data as T;
}

export function useAgencyActions(agencyId: string) {
  return useQuery({
    queryKey: ["admin-actions", agencyId],
    queryFn: async () => (await call<{ actions: AdminActionEntry[] }>(`/api/admin/agencies/${agencyId}/actions`)).actions,
  });
}

// One action: its route and what it needs, always with a reason.
export function useAdminAction<T = { ok: true }>() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ url, body }: { url: string; body: Record<string, unknown> & { reason: string } }) =>
      call<T>(url, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: async () => {
      await Promise.all(
        ["admin-users", "admin-agencies", "admin-actions", "admin-overview"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
}
