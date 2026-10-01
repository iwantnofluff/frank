"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface StaffClientAccessRow {
  membership_id: string;
  client_id: string;
}

// Readable by Primary Owner/Owner/Admin only (staff_client_access_select) —
// a restricted User gets an empty list back, not an error.
export function useStaffClientAccess(agencyId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["staff-client-access", agencyId],
    queryFn: async (): Promise<StaffClientAccessRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("staff_client_access")
        .select("membership_id, client_id");
      if (error) throw error;
      return data;
    },
    enabled: !!agencyId && enabled,
  });
}
