"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { bandOf } from "@/lib/stage-labels";

export interface ProjectCreativeStats {
  total: number;
  done: number; // approved
  waitingOnApproval: number;
  feedbackToAction: number;
}

// Per-project creative counts for the client workspace's project rows
// (matches the prototype's projStats() shape: tot/done/pend — pend here is
// kept split into waitingOnApproval/feedbackToAction rather than merged,
// since the caller needs both the combined count, for the status tag,
// and each half is cheap to keep separate).
//
// Two plain queries rather than a single embedded select — project ids for
// this client, then every one of their creatives' stage/exception — same
// reasoning as hooks/use-comments.ts: aggregating client-side avoids
// depending on Supabase's embed join behaviour for a case (a project with
// zero creatives) that needs to come back as a real zero, not a dropped
// row. RLS scopes both queries to the caller's tenant already; no
// client_id/agency_id filter added beyond what identifies which project
// rows this screen is even asking about.
export function useProjectCreativeStats(clientId: string) {
  return useQuery({
    queryKey: ["project-creative-stats", clientId],
    queryFn: async (): Promise<Record<string, ProjectCreativeStats>> => {
      const supabase = createClient();

      const { data: projects, error: projectsError } = await supabase
        .from("projects")
        .select("id")
        .eq("client_id", clientId)
        .is("archived_at", null);
      if (projectsError) throw projectsError;

      const stats: Record<string, ProjectCreativeStats> = {};
      for (const p of projects) {
        stats[p.id] = { total: 0, done: 0, waitingOnApproval: 0, feedbackToAction: 0 };
      }
      const projectIds = projects.map((p) => p.id);
      if (projectIds.length === 0) return stats;

      const { data: creatives, error: creativesError } = await supabase
        .from("creatives")
        .select("project_id, stage, exception")
        .in("project_id", projectIds)
        .is("archived_at", null);
      if (creativesError) throw creativesError;

      for (const c of creatives) {
        const s = stats[c.project_id];
        if (!s) continue;
        s.total++;
        const band = bandOf(c.stage, c.exception);
        if (band === "approved") {
          s.done++;
        } else if (band === "review") {
          s.waitingOnApproval++;
        } else if (band === "changes_requested" || band === "rejected") {
          s.feedbackToAction++;
        }
      }

      return stats;
    },
    enabled: !!clientId,
  });
}
