"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface SupportLogEntry {
  id: string;
  actor_name: string;
  action: string;
  target: string | null;
  detail: string | null;
  reason: string;
  created_at: string;
}

// What Frank's support has done in this agency (phase51), for its Owners.
// RLS (admin_actions_select) lets only Owners and the Primary Owner read it.
export function useSupportLog(agencyId: string | undefined) {
  return useQuery({
    queryKey: ["support-log", agencyId],
    queryFn: async (): Promise<SupportLogEntry[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("admin_actions")
        .select("id, actor_name, action, target, detail, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
    enabled: !!agencyId,
  });
}
