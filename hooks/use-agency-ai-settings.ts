"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface AgencyAiSettings {
  ai_default_model: string;
  ai_monthly_request_cap: number;
}

export function useAgencyAiSettings(agencyId: string | undefined) {
  return useQuery({
    queryKey: ["agency-ai-settings", agencyId],
    queryFn: async (): Promise<AgencyAiSettings> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("agencies")
        .select("ai_default_model, ai_monthly_request_cap")
        .eq("id", agencyId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!agencyId,
  });
}
