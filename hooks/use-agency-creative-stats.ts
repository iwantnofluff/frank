"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { bandOf } from "@/lib/stage-labels";

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
// Plain selects aggregated client-side rather than a count-by-group RPC:
// no such aggregate exists in the schema, and adding one would be inventing
// a database object for a hook-building task, not a schema decision this
// pass is positioned to make. Fine at today's data volumes; a real
// performance problem later is a reason to add a SECURITY DEFINER
// aggregate function, not a reason to guess at one now.
export function useAgencyCreativeStats(agencyId: string | undefined) {
  return useQuery({
    queryKey: ["agency-creative-stats", agencyId],
    queryFn: async (): Promise<AgencyCreativeStats> => {
      const supabase = createClient();

      const { count, error: projectsError } = await supabase
        .from("projects")
        .select("id", { count: "exact", head: true })
        .is("archived_at", null);
      if (projectsError) throw projectsError;

      const { data: creatives, error: creativesError } = await supabase
        .from("creatives")
        .select("stage, exception")
        .is("archived_at", null);
      if (creativesError) throw creativesError;

      let waitingOnApproval = 0;
      let feedbackToAction = 0;
      for (const c of creatives) {
        const band = bandOf(c.stage, c.exception);
        if (band === "review") waitingOnApproval++;
        else if (band === "changes_requested" || band === "rejected") feedbackToAction++;
      }

      return { liveProjects: count ?? 0, waitingOnApproval, feedbackToAction };
    },
    enabled: !!agencyId,
  });
}
