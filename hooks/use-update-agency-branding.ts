"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { AgencyTheme } from "./use-agency-settings";

// Mirrors the column default in agency_settings.theme — used so a first
// save (no row yet) still writes a complete theme object, not just the two
// keys this form edits.
const DEFAULT_THEME: AgencyTheme = {
  action: "#007BFF",
  rail: "#003C61",
  canvas: "#EDF1F6",
  surface: "#FFFFFF",
  ink: "#14161A",
  line: "#E3E6EA",
  amber: "#FF8A00",
  green: "#2BB65B",
  rose: "#FF0000",
  highlight: "#FFFBF0",
};

export function useUpdateAgencyBranding(agencyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      agencyName: string;
      primaryColour: string;
      secondaryColour: string;
      currentTheme: AgencyTheme | undefined;
    }) => {
      const supabase = createClient();

      // RLS silently returns zero rows for a blocked update rather than an
      // error — Supabase only surfaces that if a row is asked back via
      // .select(). Without it, a non-admin's blocked save would resolve as
      // a no-op "success".
      const { data: agencyRow, error: agencyError } = await supabase
        .from("agencies")
        .update({ name: input.agencyName })
        .eq("id", agencyId)
        .select("id")
        .maybeSingle();
      if (agencyError) throw agencyError;
      if (!agencyRow) {
        throw new Error("You don't have permission to change agency settings.");
      }

      const nextTheme = {
        ...(input.currentTheme ?? DEFAULT_THEME),
        action: input.primaryColour,
        rail: input.secondaryColour,
      };

      const { data: settingsRow, error: settingsError } = await supabase
        .from("agency_settings")
        .upsert(
          { agency_id: agencyId, theme: nextTheme, updated_at: new Date().toISOString() },
          { onConflict: "agency_id" },
        )
        .select("agency_id")
        .maybeSingle();
      if (settingsError) throw settingsError;
      if (!settingsRow) {
        throw new Error("You don't have permission to change agency settings.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agency-settings", agencyId] });
      queryClient.invalidateQueries({ queryKey: ["my-agency"] });
    },
  });
}
