"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { AdminNotificationPrefs } from "@/lib/admin/notifications";

// The signed-in platform admin's own account (Admin → Settings).

async function call<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong");
  return data as T;
}

export function useAdminNotifications() {
  return useQuery({
    queryKey: ["admin-notifications"],
    queryFn: async () => (await call<{ prefs: AdminNotificationPrefs }>("/api/admin/me/notifications", "GET")).prefs,
  });
}

export function useSaveAdminNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: AdminNotificationPrefs) =>
      call<{ prefs: AdminNotificationPrefs }>("/api/admin/me/notifications", "PATCH", change),
    onSuccess: (data) => queryClient.setQueryData(["admin-notifications"], data.prefs),
  });
}

export function useChangeAdminPassword() {
  return useMutation({
    mutationFn: (input: { current: string; next: string }) => call("/api/admin/me/password", "POST", input),
  });
}

export function useStartAdminEmailChange() {
  return useMutation({
    mutationFn: (input: { email: string; current: string }) =>
      call<{ sentTo: string }>("/api/admin/me/email", "POST", input),
  });
}

export function useConfirmAdminEmailChange() {
  return useMutation({
    mutationFn: (token: string) => call<{ email: string }>("/api/admin/me/email/confirm", "POST", { token }),
  });
}

// Every other browser or device this account is signed in on.
export function useSignOutOtherSessions() {
  return useMutation({
    mutationFn: async () => {
      const { error } = await createClient().auth.signOut({ scope: "others" });
      if (error) throw error;
    },
  });
}
