"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { AComment, AEvent, APost, AVersion } from "@/lib/analytics";

// Everything Analytics reads (phase71), for the agency the page is on (RLS
// scopes every select; the stage log is readable by Owners and Admins only).
// Supabase answers 1000 rows at a time, so each table is read in pages.
export interface AnalyticsData {
  posts: APost[];
  events: AEvent[];
  versions: AVersion[];
  comments: AComment[];
  clients: { id: string; name: string }[];
  projects: { id: string; name: string; clientId: string }[];
  people: { id: string; name: string }[];
  // Each client's "sent ahead" promise in days (phase72; 28 unless set).
  leadDays: Record<string, number>;
  // Posts a month the client's contract sets (phase73); absent when not set.
  contracts: Record<string, number>;
}

const PAGE = 1000;

async function all<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

export function useAnalytics(enabled: boolean) {
  return useQuery({
    queryKey: ["analytics"],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<AnalyticsData> => {
      const s = createClient();
      const [clients, projects, creatives, events, creativeVersions, copyVersions, comments, members, prefs] = await Promise.all([
        all((a, b) => s.from("clients").select("id, name").order("name").range(a, b)),
        all((a, b) => s.from("projects").select("id, name, client_id").order("name").range(a, b)),
        all((a, b) =>
          s
            .from("creatives")
            .select("id, name, project_id, format, formats, lead_user_id, created_by, stage, created_at, approved_at, scheduled_at")
            .is("archived_at", null)
            .order("created_at")
            .range(a, b),
        ),
        all((a, b) => s.from("creative_stage_events").select("creative_id, from_stage, to_stage, exception, at").order("at").range(a, b)),
        all((a, b) => s.from("creative_versions").select("creative_id, created_at").range(a, b)),
        all((a, b) => s.from("copy_versions").select("creative_id, created_at").range(a, b)),
        all((a, b) =>
          s
            .from("comments")
            .select("creative_id, author_id, parent_id, issue_category, sentiment, created_at, resolved_at")
            .is("deleted_at", null)
            .range(a, b),
        ),
        all((a, b) =>
          s.from("memberships").select("user_id, client_id, user:users!memberships_user_id_fkey(name)").range(a, b),
        ),
        all((a, b) => s.from("client_preferences").select("client_id, lead_days, contracted_posts_per_month").range(a, b)),
      ]);

      const clientOfProject = new Map(projects.map((p) => [p.id, p.client_id as string]));
      // Who's on the client's side: a guest (no author), or anyone whose
      // place in this agency is at a client (phase63: never both).
      const clientPeople = new Set(members.filter((m) => m.client_id).map((m) => m.user_id as string));
      const teamNames = new Map<string, string>();
      for (const m of members) {
        const name = (m.user as unknown as { name: string } | null)?.name;
        if (!m.client_id && name) teamNames.set(m.user_id as string, name);
      }

      return {
        clients: clients as { id: string; name: string }[],
        projects: projects.map((p) => ({ id: p.id as string, name: p.name as string, clientId: p.client_id as string })),
        leadDays: Object.fromEntries(prefs.map((p) => [p.client_id as string, p.lead_days as number])),
        contracts: Object.fromEntries(
          prefs
            .filter((p) => p.contracted_posts_per_month !== null)
            .map((p) => [p.client_id as string, p.contracted_posts_per_month as number]),
        ),
        people: [...teamNames].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
        posts: creatives
          .filter((c) => clientOfProject.has(c.project_id as string))
          .map((c) => ({
            id: c.id as string,
            name: c.name as string,
            projectId: c.project_id as string,
            clientId: clientOfProject.get(c.project_id as string)!,
            formats: ((c.formats as string[] | null)?.length ? (c.formats as string[]) : [c.format as string]),
            personId: ((c.lead_user_id ?? c.created_by) as string | null) ?? null,
            stage: c.stage as number,
            createdAt: c.created_at as string,
            approvedAt: c.approved_at as string | null,
            scheduledAt: c.scheduled_at as string | null,
          })),
        events: events.map((e) => ({
          creativeId: e.creative_id as string,
          fromStage: e.from_stage as number | null,
          toStage: e.to_stage as number,
          exception: e.exception as string | null,
          at: e.at as string,
        })),
        versions: [
          ...creativeVersions.map((v) => ({ creativeId: v.creative_id as string, kind: "creative" as const, createdAt: v.created_at as string })),
          ...copyVersions.map((v) => ({ creativeId: v.creative_id as string, kind: "copy" as const, createdAt: v.created_at as string })),
        ],
        comments: comments.map((c) => ({
          creativeId: c.creative_id as string,
          clientSide: !c.author_id || clientPeople.has(c.author_id as string),
          category: c.issue_category as string | null,
          sentiment: c.sentiment as AComment["sentiment"],
          createdAt: c.created_at as string,
          resolvedAt: c.resolved_at as string | null,
          isReply: !!c.parent_id,
        })),
      };
    },
  });
}
