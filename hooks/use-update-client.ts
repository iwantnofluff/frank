"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Replaces use-rename-client.ts now that the client edit modal covers more
// than just the name — one instance handles every row on the page, the
// target id travels in the mutate-time payload the same shape
// useRenameClient's own invalidation already assumed.
export function useUpdateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clientId,
      name,
      industry,
    }: {
      clientId: string;
      name: string;
      industry: string;
    }) => {
      const supabase = createClient();
      // RLS silently returns zero rows for a blocked update rather than an
      // error — only surfaced if a row is asked back via .select(). See
      // use-update-brief.ts for the same guard.
      const { data, error } = await supabase
        .from("clients")
        .update({ name: name.trim(), industry: industry.trim() || null })
        .eq("id", clientId)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error("You don't have permission to edit this client.");
      }
    },
    onSuccess: (_data, { clientId }) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["client", clientId] });
    },
  });
}
