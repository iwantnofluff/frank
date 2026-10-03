"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Theme } from "@/lib/theme";

// Saves the parts of the agency's look a Settings page changes — its
// name, its complete theme, and/or its own saved presets — leaving the rest. Only Admin and above may (RLS on both
// agencies and agency_settings); a blocked write returns zero rows rather
// than an error, so each is asked back and checked.
export function useSaveBranding(agencyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      agencyName?: string;
      theme?: Theme;
      customPresets?: Record<string, Partial<Theme>>;
    }) => {
      const supabase = createClient();
      if (input.agencyName !== undefined) {
        const { data: agencyRow, error: agencyError } = await supabase
          .from("agencies")
          .update({ name: input.agencyName.trim() })
          .eq("id", agencyId)
          .select("id")
          .maybeSingle();
        if (agencyError) throw agencyError;
        if (!agencyRow) throw new Error("Only Admins and Owners can change this.");
      }

      if (input.theme !== undefined || input.customPresets !== undefined) {
        const { data: settingsRow, error: settingsError } = await supabase
          .from("agency_settings")
          .upsert(
            {
              agency_id: agencyId,
              ...(input.theme !== undefined ? { theme: input.theme } : {}),
              ...(input.customPresets !== undefined ? { custom_presets: input.customPresets } : {}),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "agency_id" },
          )
          .select("agency_id")
          .maybeSingle();
        if (settingsError) throw settingsError;
        if (!settingsRow) throw new Error("Only Admins and Owners can change this.");
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["agency-settings", agencyId] }),
        queryClient.invalidateQueries({ queryKey: ["my-agency"] }),
      ]);
    },
  });
}
