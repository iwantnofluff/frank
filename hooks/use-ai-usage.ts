"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { monthStart, type UsageRow } from "@/lib/ai/usage";

export interface AiUsage {
  rows: UsageRow[];
  names: Record<string, string>;
  // When the rows were read, so the page's month and days stay put.
  readAt: string;
}

// Settings → Credit Usage: this month's AI requests (ai_usage_events), and
// the names of who made them. Pages through, since an allowance can pass
// the 1,000 rows a single read returns. Owners and Admins only, by the page.
export function useAiUsage(enabled: boolean) {
  return useQuery({
    queryKey: ["ai-usage"],
    queryFn: async (): Promise<AiUsage> => {
      const supabase = createClient();
      const now = new Date();
      const rows: UsageRow[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("ai_usage_events")
          .select("created_at, user_id, task")
          .gte("created_at", monthStart(now).toISOString())
          // Ask Frank's questions don't count towards the limit (phase147).
          .or("task.is.null,task.neq.ask_frank")
          .order("created_at")
          .range(from, from + PAGE - 1);
        if (error) throw error;
        rows.push(...data);
        if (data.length < PAGE) break;
      }

      // Two plain queries rather than an embed (see use-comments.ts).
      const ids = [...new Set(rows.map((r) => r.user_id))];
      const names: Record<string, string> = {};
      if (ids.length) {
        const { data, error } = await supabase.from("users").select("id, name").in("id", ids);
        if (error) throw error;
        for (const u of data) names[u.id] = u.name;
      }
      return { rows, names, readAt: now.toISOString() };
    },
    enabled,
  });
}
