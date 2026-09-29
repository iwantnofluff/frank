"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { ISSUE_CATEGORIES, type IssueCategory } from "@/lib/ai/build-classify-comment-prompt";

export interface RepeatIssue {
  category: IssueCategory;
  label: string;
  count: number;
}

const MIN_REPEAT_COUNT = 2;

// The repeat-issue alarm (docs/frank-data-intelligence.pdf, "The signal
// worth building everything else around") — category-level recurrence per
// client+format for this phase, not the doc's own finer phrase-clustering
// example ("text too close to the interface edge" recognised as the same
// issue each time), confirmed with the user directly; that needs a second
// clustering pass this phase doesn't build.
//
// Same plain-select-plus-client-side-aggregate shape as
// use-client-list-stats.ts/use-agency-creative-stats.ts — no count-by-
// category aggregate exists in the schema, and adding one isn't this
// hook's decision to make. Two steps (this client's creative ids for the
// format, then a count of matching comments among them) since creatives
// has no client_id of its own, only project_id.
export function useRepeatIssueCount(
  clientId: string | undefined,
  format: string | undefined,
  windowDays = 90,
) {
  return useQuery({
    queryKey: ["repeat-issues", clientId, format, windowDays],
    queryFn: async (): Promise<RepeatIssue | null> => {
      const supabase = createClient();

      const { data: projects, error: projectsError } = await supabase
        .from("projects")
        .select("id")
        .eq("client_id", clientId as string);
      if (projectsError) throw projectsError;
      const projectIds = projects.map((p) => p.id);
      if (projectIds.length === 0) return null;

      const { data: creatives, error: creativesError } = await supabase
        .from("creatives")
        .select("id")
        .in("project_id", projectIds)
        .eq("format", format as string);
      if (creativesError) throw creativesError;
      const creativeIds = creatives.map((c) => c.id);
      if (creativeIds.length === 0) return null;

      const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
      const { data: comments, error: commentsError } = await supabase
        .from("comments")
        .select("issue_category")
        .in("creative_id", creativeIds)
        .neq("issue_category", "no_issue")
        .gte("created_at", since);
      if (commentsError) throw commentsError;

      const counts = new Map<string, number>();
      for (const c of comments) {
        if (!c.issue_category) continue;
        counts.set(c.issue_category, (counts.get(c.issue_category) ?? 0) + 1);
      }

      let top: { category: string; count: number } | null = null;
      for (const [category, count] of counts) {
        if (count >= MIN_REPEAT_COUNT && (!top || count > top.count)) {
          top = { category, count };
        }
      }
      if (!top) return null;

      const label = ISSUE_CATEGORIES.find((c) => c.key === top!.category)?.label ?? top.category;
      return { category: top.category as IssueCategory, label, count: top.count };
    },
    enabled: !!clientId && !!format,
  });
}
