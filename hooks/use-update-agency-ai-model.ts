"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// agencies_update is admin-only (is_agency_admin(), phase0_baseline.sql) —
// a non-admin staff member's save fails RLS silently unless a row is
// asked back via .select(), same guard as useUpdateAgencyBranding.
export function useUpdateAgencyAiModel(agencyId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (model: string) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("agencies")
        .update({ ai_default_model: model })
        .eq("id", agencyId!)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error("You don't have permission to change this setting.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agency-ai-settings", agencyId] });
    },
  });
}
