"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { latestByCreative, REWORK_VERSION_TABLES } from "@/lib/awaiting-rework";

// When each post last had a new version of anything the client reviews
// (lib/awaiting-rework.ts), for the share window to count what a link's
// Also waiting for your review will list. The team only.
export function useLatestVersionAt(creativeIds: string[], enabled = true) {
  const key = [...creativeIds].sort().join(",");
  return useQuery({
    queryKey: ["latest-version-at", key],
    queryFn: async (): Promise<Record<string, string>> => {
      if (creativeIds.length === 0) return {};
      const supabase = createClient();
      const lists = await Promise.all(
        REWORK_VERSION_TABLES.map(async (table) => {
          const { data, error } = await supabase.from(table).select("creative_id, created_at").in("creative_id", creativeIds);
          if (error) throw error;
          return data as { creative_id: string; created_at: string }[];
        }),
      );
      return Object.fromEntries(latestByCreative(lists.flat()));
    },
    enabled: enabled && creativeIds.length > 0,
  });
}
