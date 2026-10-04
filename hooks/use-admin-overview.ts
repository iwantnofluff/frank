"use client";

import { useQuery } from "@tanstack/react-query";
import type { AdminOverview } from "@/lib/admin/overview";

// The platform admin's overview, through /api/admin/overview, which checks
// platform_admins on every call.
export function useAdminOverview() {
  return useQuery({
    queryKey: ["admin-overview"],
    queryFn: async () => {
      const res = await fetch("/api/admin/overview");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      return (data as { overview: AdminOverview }).overview;
    },
  });
}
