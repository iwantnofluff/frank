"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { bandOf, type Exception } from "@/lib/stage-labels";

export interface AgencyCreativeStats {
  liveProjects: number;
  waitingOnApproval: number;
  feedbackToAction: number;
}

// Dashboard's three previously-unpopulated .stat cards. No agency_id filter
// on either query — RLS (creatives_select/projects_select) already scopes
// both to the caller's own agency; adding one here would be redundant and
// could mask a policy that's actually wrong (frank-conventions). Verified
// empirically, not just assumed — see
// docs/agency-creative-stats-verification.md.
//
// Counted in the database (creative_stage_counts, phase133), as the
// person asking: their own row rules decide what's counted, as the plain
// selects this replaced did. Those selects downloaded every post's stage,
// which grew with the workspace and stopped at 1,000 rows (a silent
// undercount past that). They stay as the fallback for a database that
// doesn't have the function yet. Not waiting on the agency: nothing here
// filters by it.
export function useAgencyCreativeStats() {
  return useQuery({
    queryKey: ["agency-creative-stats"],
    queryFn: async (): Promise<AgencyCreativeStats> => {
      const supabase = createClient();

      const [projects, grouped] = await Promise.all([
        supabase.from("projects").select("id", { count: "exact", head: true }).is("archived_at", null),
        supabase.rpc("creative_stage_counts"),
      ]);
      if (projects.error) throw projects.error;

      type Group = { stage: number; exception: Exception | null; n: number };
      let groups: Group[];
      if (!grouped.error) {
        groups = (grouped.data ?? []) as Group[];
      } else {
        const { data: creatives, error: creativesError } = await supabase
          .from("creatives")
          .select("stage, exception")
          .is("archived_at", null);
        if (creativesError) throw creativesError;
        groups = creatives.map((c) => ({ stage: c.stage, exception: c.exception, n: 1 }));
      }

      let waitingOnApproval = 0;
      let feedbackToAction = 0;
      for (const g of groups) {
        const band = bandOf(g.stage, g.exception);
        if (band === "review") waitingOnApproval += Number(g.n);
        else if (band === "changes_requested" || band === "rejected") feedbackToAction += Number(g.n);
      }

      return { liveProjects: projects.count ?? 0, waitingOnApproval, feedbackToAction };
    },
  });
}
