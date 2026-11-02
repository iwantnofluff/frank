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

// Dashboard's "Projects" and "Last Activity" columns. Counted in the
// database (client_list_stats, phase133), as the person asking, so RLS
// (clients_select/projects_select/creatives_select) scopes it exactly as
// the three plain reads it replaced did; those downloaded every post's
// date, and stopped at 1,000. They stay as the fallback for a database
// that doesn't have the function yet. Not waiting on the agency: nothing
// here filters by it.
export function useClientListStats() {
  return useQuery({
    queryKey: ["client-list-stats"],
    queryFn: async (): Promise<Record<string, ClientListStats>> => {
      const supabase = createClient();

      const { data: rows, error: rpcError } = await supabase.rpc("client_list_stats");
      if (!rpcError) {
        const stats: Record<string, ClientListStats> = {};
        for (const r of (rows ?? []) as { client_id: string; active_projects: number; last_activity: string | null }[]) {
          stats[r.client_id] = { activeProjectCount: Number(r.active_projects), lastActivityAt: r.last_activity };
        }
        return stats;
      }

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
  });
}
