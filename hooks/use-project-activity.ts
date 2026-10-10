"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface ActivityRow {
  at: string;
  kind: string;
  by_user: string | null;
  by_name: string | null;
  creative_id: string | null;
  creative_name: string | null;
  detail: Record<string, unknown>;
}

const PAGE = 60;

// A project's Activity log (phase84), newest first, a page at a time: what
// was already recorded (posts, stages, versions, comments, review links)
// and the log kept from phase84 on, merged by project_activity_feed.
export function useProjectActivity(projectId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ["project-activity", projectId],
    enabled: enabled && !!projectId,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<ActivityRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("project_activity_feed", {
        p_project_id: projectId,
        p_before: pageParam,
        p_limit: PAGE,
      });
      if (error) throw error;
      return (data ?? []) as ActivityRow[];
    },
    // Earlier than the last one shown; none once a page comes back short.
    getNextPageParam: (last) => (last.length < PAGE ? null : last[last.length - 1].at),
  });
}
