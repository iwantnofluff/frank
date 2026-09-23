"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface LatestFeedback {
  body: string;
  createdAt: string;
}

// The calendar table's "Client Feedback" column (docs/parity-gaps.md) —
// the most recent unresolved *public* comment per creative, batched for
// the whole project in one query rather than per row. Public only: an
// internal-only comment isn't "client feedback" by definition, and
// comments_select's own RLS already keeps a client-role caller from
// seeing private ones regardless.
export function useLatestFeedbackByCreative(creativeIds: string[]) {
  const key = [...creativeIds].sort().join(",");
  return useQuery({
    queryKey: ["latest-feedback-by-creative", key],
    queryFn: async (): Promise<Record<string, LatestFeedback>> => {
      if (creativeIds.length === 0) return {};
      const supabase = createClient();
      const { data, error } = await supabase
        .from("comments")
        .select("creative_id, body, created_at")
        .in("creative_id", creativeIds)
        .eq("visibility", "public")
        .is("resolved_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const result: Record<string, LatestFeedback> = {};
      for (const row of data) {
        if (result[row.creative_id]) continue;
        result[row.creative_id] = { body: row.body, createdAt: row.created_at };
      }
      return result;
    },
    enabled: creativeIds.length > 0,
  });
}
