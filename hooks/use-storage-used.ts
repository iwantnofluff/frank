"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// What the agency has stored, in bytes (phase41, agency_storage_used):
// every file in its folder, at the size Storage recorded.
export function useStorageUsed(agencyId: string | undefined) {
  return useQuery({
    queryKey: ["storage-used", agencyId],
    queryFn: async (): Promise<number> => {
      const { data, error } = await createClient().rpc("agency_storage_used", { check_agency_id: agencyId! });
      if (error) throw error;
      return Number(data ?? 0);
    },
    enabled: !!agencyId,
  });
}
