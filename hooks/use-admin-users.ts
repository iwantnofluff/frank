"use client";

import { useQuery } from "@tanstack/react-query";
import type { AdminPerson, AdminPersonDetail } from "@/lib/admin/people";

// The platform admin's view of people (decided directly, 4 Oct 2026),
// through /api/admin/users, which checks platform_admins on every call.
// View-only.
async function call<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong");
  return data as T;
}

export function useAdminUsers() {
  return useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => (await call<{ people: AdminPerson[] }>("/api/admin/users")).people,
  });
}

export function useAdminUser(id: string) {
  return useQuery({
    queryKey: ["admin-users", id],
    queryFn: async () => (await call<{ person: AdminPersonDetail }>(`/api/admin/users/${id}`)).person,
    enabled: !!id,
  });
}
