"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// beingfrank.app (phase42): signing an agency up, and finding the address
// to sign in at.

async function post<T>(path: string, body: unknown, fallback: string): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? fallback);
  return data as T;
}

// Free, allowed, and never another agency's — asked as it's typed.
export function useAddressAvailable(subdomain: string) {
  return useQuery({
    queryKey: ["address-available", subdomain],
    queryFn: async (): Promise<{ available: boolean; problem: string | null }> => {
      const res = await fetch(`/api/signup/address?sub=${encodeURIComponent(subdomain)}`);
      return res.json();
    },
    enabled: subdomain.length >= 2,
    staleTime: 10_000,
  });
}

export function useSignUp() {
  return useMutation({
    mutationFn: (input: {
      agencyName: string;
      subdomain: string;
      firstName: string;
      lastName: string;
      email: string;
      password: string;
    }) => post<{ address: string }>("/api/signup", input, "Couldn't sign you up"),
  });
}

// Signing in: which agency is at this address, if any — or where it moved.
export function useFindWorkspace() {
  return useMutation({
    mutationFn: async (subdomain: string): Promise<string | null> => {
      const supabase = createClient();
      const { data } = await supabase.rpc("workspace_for_subdomain", { p_subdomain: subdomain });
      if ((data as unknown[] | null)?.length) return subdomain;
      const { data: moved } = await supabase.rpc("current_subdomain_for", { p_subdomain: subdomain });
      return typeof moved === "string" && moved ? moved : null;
    },
  });
}

export function useEmailMyAddresses() {
  return useMutation({
    mutationFn: (email: string) => post("/api/find-workspaces", { email }, "Couldn't send it"),
  });
}
