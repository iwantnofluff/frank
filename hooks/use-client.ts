"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface ClientDetailRow {
  id: string;
  name: string;
  industry: string | null;
  accent_colour: string | null;
  archived_at: string | null;
  logo_asset_id: string | null;
  description: string | null;
  // The sample client (phase145): not counted towards the limits, and
  // removed when sample_expires_at passes (null until the first visit).
  is_sample: boolean;
  sample_expires_at: string | null;
}

export function useClientDetail(clientId: string) {
  return useQuery({
    queryKey: ["client", clientId],
    queryFn: async (): Promise<ClientDetailRow> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, industry, accent_colour, archived_at, logo_asset_id, description, is_sample, sample_expires_at")
        .eq("id", clientId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });
}
