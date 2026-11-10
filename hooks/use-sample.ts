"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// The sample client's Remove now (phase145): the client, its project, posts
// and files, for good.
export function useRemoveSample() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (clientId: string) => {
      const res = await fetch("/api/sample/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't remove the sample client");
    },
    onSuccess: () => queryClient.invalidateQueries({ refetchType: "all" }),
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
