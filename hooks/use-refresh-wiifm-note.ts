"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

// Regenerates creatives.approach_notes from whatever copy version was just
// saved (app/api/ai/wiifm-note) and invalidates the creative query on
// success — CreativeModal's own "WIIFM Direction" section (and the Brief
// tab's read-only Approach Notes field, same underlying column) both read
// straight from that query's data, so this is the only place that needs
// to know the fetch happened.
export function useRefreshWiifmNote(creativeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (agencyId: string): Promise<string[]> => {
      const res = await fetch("/api/ai/wiifm-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyId, creativeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't update the WIIFM direction");
      return data.approachNotes as string[];
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["creative", creativeId] });
    },
  });
}
