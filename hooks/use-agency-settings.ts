"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Theme } from "@/lib/theme";

export interface AgencySettingsRow {
  agency_id: string;
  // As stored: may still use the original column default's keys
  // ("highlight", no "private") — read it through normaliseTheme().
  theme: Record<string, unknown>;
  logo_asset_id: string | null;
  custom_presets: Record<string, Partial<Theme>>;
}

export function useAgencySettings(agencyId: string | undefined) {
  return useQuery({
    queryKey: ["agency-settings", agencyId],
    queryFn: async (): Promise<AgencySettingsRow | null> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("agency_settings")
        .select("agency_id, theme, logo_asset_id, custom_presets")
        .eq("agency_id", agencyId!)
        .maybeSingle();

      if (error) throw error;
      return data as AgencySettingsRow | null;
    },
    enabled: !!agencyId,
  });
}
