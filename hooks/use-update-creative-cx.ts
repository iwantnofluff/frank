"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Atomic single-field write via update_creative_cx (phase15) — a single
// jsonb_set inside one UPDATE statement, not a client-side fetch-then-merge,
// so two fields on the same row edited in quick succession (the continuous-
// delivery content-planner template puts up to 7 cx-backed fields on one
// row) can never lose one edit to the other. p_value_json is always a
// JSON.stringify'd string, even for null — see the migration's own comment
// for why a bare jsonb null parameter isn't safe to use here.
export function useUpdateCreativeCx(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      creativeId,
      key,
      value,
    }: {
      creativeId: string;
      key: string;
      value: string | number | boolean | null;
    }) => {
      const supabase = createClient();
      // RLS silently returns zero rows (no error) for a blocked update —
      // same guard every other mutation hook in this app uses.
      const { data, error } = await supabase.rpc("update_creative_cx", {
        p_creative_id: creativeId,
        p_key: key,
        p_value_json: JSON.stringify(value),
      });
      if (error) throw error;
      if (!data) {
        throw new Error("You don't have permission to edit this field.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creatives", projectId] });
    },
  });
}
