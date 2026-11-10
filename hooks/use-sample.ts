"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Hide or show the sample client (phase146: it's never deleted). Hidden is
// archived, which every list, count and search leaves out; Frank Tour and
// Show Me still use it. Either way it's kept from then on, the clock done.
export function useHideSample() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientId, hide }: { clientId: string; hide: boolean }) => {
      const { data, error } = await createClient()
        .from("clients")
        .update({ archived_at: hide ? new Date().toISOString() : null, sample_expires_at: SAMPLE_KEPT })
        .eq("id", clientId)
        .eq("is_sample", true)
        .select("id");
      if (error) throw error;
      // A blocked update reports no error, only no rows.
      if (!data?.length) throw new Error(hide ? "Couldn't hide the sample client" : "Couldn't show the sample client");
    },
    onSuccess: () => queryClient.invalidateQueries({ refetchType: "all" }),
  });
}

// Put it back as it was (Preferences), shown or hidden as it is.
export function useResetSample(agencyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/sample/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't reset the sample client");
    },
    onSuccess: () => queryClient.invalidateQueries({ refetchType: "all" }),
  });
}

// "Kept" is an end date that never comes (direct instruction: Owners can
// keep the sample): the daily clean-up only removes samples whose date has
// passed, and starting the clock only sets one that's empty.
export const SAMPLE_KEPT = "infinity";

export function isSampleKept(expiresAt: string | null | undefined) {
  return expiresAt === SAMPLE_KEPT;
}

// Add the Sample Client (Preferences): made on the server, as at sign-up.
export function useAddSample(agencyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/sample/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't add the sample client");
      return data.clientId as string;
    },
    onSuccess: () => queryClient.invalidateQueries({ refetchType: "all" }),
  });
}

// Keep it, or have it removed 7 days from now.
export function useKeepSample() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientId, keep }: { clientId: string; keep: boolean }) => {
      const { data, error } = await createClient()
        .from("clients")
        .update({ sample_expires_at: keep ? SAMPLE_KEPT : new Date(Date.now() + 7 * 86_400_000).toISOString() })
        .eq("id", clientId)
        .eq("is_sample", true)
        .select("id");
      if (error) throw error;
      // A blocked update reports no error, only no rows.
      if (!data?.length) throw new Error("Couldn't change the sample client");
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["clients"] }),
        queryClient.invalidateQueries({ queryKey: ["client"] }),
      ]);
    },
  });
}

// Its 7 days start on the workspace's first visit (start_sample_clock):
// asked once as Frank opens, by the team; it only ever sets the date once.
export function useStartSampleClock(enabled: boolean) {
  const queryClient = useQueryClient();
  const asked = useRef(false);
  useEffect(() => {
    if (!enabled || asked.current) return;
    asked.current = true;
    void createClient()
      .rpc("start_sample_clock")
      .then(({ error }) => {
        if (!error) {
          void queryClient.invalidateQueries({ queryKey: ["clients"] });
          void queryClient.invalidateQueries({ queryKey: ["client"] });
        }
      });
  }, [enabled, queryClient]);
}
