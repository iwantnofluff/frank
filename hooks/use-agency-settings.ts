"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface AgencyTheme {
  action: string;
  rail: string;
  canvas: string;
  surface: string;
  ink: string;
  line: string;
  amber: string;
  green: string;
  rose: string;
  highlight: string;
}

export interface AgencySettingsRow {
  agency_id: string;
  theme: AgencyTheme;
  logo_asset_id: string | null;
}

export function useAgencySettings(agencyId: string | undefined) {
  return useQuery({
    queryKey: ["agency-settings", agencyId],
    queryFn: async (): Promise<AgencySettingsRow | null> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("agency_settings")
        .select("agency_id, theme, logo_asset_id")
        .eq("agency_id", agencyId!)
        .maybeSingle();

      if (error) throw error;
      return data as AgencySettingsRow | null;
    },
    enabled: !!agencyId,
  });
}
