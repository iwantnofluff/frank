"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Theme } from "@/lib/theme";

export interface AgencySettingsRow {
  agency_id: string;
  // As stored: may still use the original column default's keys
  // ("highlight", no "private") — read it through normaliseTheme().
  theme: Record<string, unknown>;
  logo_asset_id: string | null;
  custom_presets: Record<string, Partial<Theme>>;
  // How long a read notification is kept (phase90): 30, 60 or 90 days.
  notification_keep_days: 30 | 60 | 90;
}

export function useAgencySettings(agencyId: string | undefined) {
  return useQuery({
    queryKey: ["agency-settings", agencyId],
    queryFn: async (): Promise<AgencySettingsRow | null> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("agency_settings")
        .select("agency_id, theme, logo_asset_id, custom_presets, notification_keep_days")
        .eq("agency_id", agencyId!)
        .maybeSingle();

      if (error) throw error;
      return data as AgencySettingsRow | null;
    },
    enabled: !!agencyId,
  });
}

// How long read notifications are kept (phase90). Owners and Admins only
// (agency_settings RLS); a blocked save comes back with no row, which is
// said rather than taken as saved.
export function useSaveNotificationKeep(agencyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (days: 30 | 60 | 90) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("agency_settings")
        .upsert({ agency_id: agencyId!, notification_keep_days: days }, { onConflict: "agency_id" })
        .select("agency_id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Only Owners and Admins can change this.");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agency-settings", agencyId] }),
  });
}
