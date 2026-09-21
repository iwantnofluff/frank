"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// cx is a jsonb blob, not real columns, so there's no server-side "patch
// just this key" without a Postgres function — fetch-then-merge is fine for
// one editor at a time. A concurrent-edit-safe version would move this to
// an RPC using jsonb_set.
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
      const { data: current, error: fetchError } = await supabase
        .from("creatives")
        .select("cx")
        .eq("id", creativeId)
        .single();
      if (fetchError) throw fetchError;

      const nextCx = { ...(current?.cx ?? {}), [key]: value };
      // RLS silently returns zero rows for a blocked update rather than an
      // error — only surfaced if a row is asked back via .select() (see
      // useUpdateAgencyBranding for the same guard).
      const { data, error } = await supabase
        .from("creatives")
        .update({ cx: nextCx })
        .eq("id", creativeId)
        .select("id")
        .maybeSingle();
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
