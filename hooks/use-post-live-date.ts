"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface PostLiveDate {
  live_at: string;
  source: "instagram" | "manual";
  permalink: string | null;
}

// When a post really went live (phase98/99): found on its client's
// Instagram by Frank, or set by hand with the Live pill. The team's only
// (RLS); a client gets none.
export function usePostLiveDate(creativeId: string | null | undefined) {
  return useQuery({
    queryKey: ["post-live-date", creativeId],
    queryFn: async (): Promise<PostLiveDate | null> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("post_live_dates")
        .select("live_at, source, permalink")
        .eq("creative_id", creativeId!)
        .maybeSingle();
      if (error) throw error;
      return (data as PostLiveDate | null) ?? null;
    },
    enabled: !!creativeId,
  });
}
