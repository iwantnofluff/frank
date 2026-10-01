"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

// Deletes every artwork version of a post, with its files and the comments
// on it, through /api/creatives/clear-artwork (phase33) — used when a
// format change means the uploaded artwork no longer fits, after a warning.
export function useClearArtwork(creativeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/creatives/clear-artwork", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creativeId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(res.status === 403 ? "You don't have permission to remove this artwork." : (data.error ?? "Couldn't remove the artwork"));
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["creative-versions", creativeId] }),
        queryClient.invalidateQueries({ queryKey: ["comments", creativeId] }),
        queryClient.invalidateQueries({ queryKey: ["creatives"] }),
      ]);
    },
  });
}
