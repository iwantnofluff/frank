"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface ClientListStats {
  activeProjectCount: number;
  // Most recent creatives.created_at across a client's active projects —
  // the closest real, schema-backed proxy to "activity" this app has (no
  // separate activity-log table exists, same trade-off already made for
  // the client workspace's own "Campaigns" stat).
  lastActivityAt: string | null;
}

// Dashboard's "Projects" and "Last Activity" columns — both previously
// hardcoded "—", never wired to any real data. No agency_id filter on any
// of the three queries — RLS (clients_select/projects_select/
// creatives_select) already scopes each to the caller's own agency,
// matching use-agency-creative-stats.ts's own reasoning.
export function useClientListStats(agencyId: string | undefined) {
  return useQuery({
    queryKey: ["client-list-stats", agencyId],
    queryFn: async (): Promise<Record<string, ClientListStats>> => {
      const supabase = createClient();

      const { data: clients, error: clientsError } = await supabase
        .from("clients")
        .select("id");
      if (clientsError) throw clientsError;

      const stats: Record<string, ClientListStats> = {};
      for (const c of clients) {
        stats[c.id] = { activeProjectCount: 0, lastActivityAt: null };
      }

      const { data: projects, error: projectsError } = await supabase
        .from("projects")
        .select("id, client_id")
        .is("archived_at", null);
      if (projectsError) throw projectsError;

      const clientIdByProjectId = new Map(projects.map((p) => [p.id, p.client_id]));
      for (const p of projects) {
        const s = stats[p.client_id];
        if (s) s.activeProjectCount++;
      }

      const projectIds = projects.map((p) => p.id);
      if (projectIds.length === 0) return stats;

      const { data: creatives, error: creativesError } = await supabase
        .from("creatives")
        .select("project_id, created_at")
        .in("project_id", projectIds)
        .is("archived_at", null);
      if (creativesError) throw creativesError;

      for (const c of creatives) {
        const clientId = clientIdByProjectId.get(c.project_id);
        const s = clientId ? stats[clientId] : undefined;
        if (s && (!s.lastActivityAt || c.created_at > s.lastActivityAt)) {
          s.lastActivityAt = c.created_at;
        }
      }

      return stats;
    },
    enabled: !!agencyId,
  });
}
