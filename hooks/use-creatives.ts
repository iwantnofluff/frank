"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface CreativeListRow {
  id: string;
  name: string;
  format: string;
  stage: number;
  exception: "changes_requested" | "rejected" | null;
  lead_user_id: string | null;
  concept: string | null;
  reference_url: string | null;
  approach_notes: string[] | null;
  scheduled_at: string | null;
  formats: string[]; // every format, main first (phase29)
  destination: string | null;
  added_on: string;
  due_on: string | null;
  published_at: string | null;
  cx: Record<string, string | number | boolean | null>;
  archived_at: string | null;
  lead: { name: string } | null;
}

export function useCreatives(projectId: string) {
  return useQuery({
    queryKey: ["creatives", projectId],
    queryFn: async (): Promise<CreativeListRow[]> => {
      const supabase = createClient();

      // Plain select plus a second query for lead names, merged client-side
      // — same reasoning as hooks/use-comments.ts's author resolution:
      // lead_user_id is nullable, and this avoids depending on an embedded
      // join's row-dropping behaviour for that case.
      // Fetches archived creatives too, filtered client-side by the page —
      // same shape as use-projects.ts, so a project's own Active/Archived
      // toggle can offer them back rather than deleting being a one-way
      // door. FeedPreviewGrid/ShareModal (the two other callers) filter
      // archived ones back out themselves, same convention.
      const { data: rows, error } = await supabase
        .from("creatives")
        .select(
          "id, name, format, stage, exception, lead_user_id, concept, reference_url, approach_notes, scheduled_at, formats, destination, added_on, due_on, published_at, cx, archived_at",
        )
        .eq("project_id", projectId)
        .order("position");

      if (error) throw error;

      const leadIds = [...new Set(rows.map((r) => r.lead_user_id).filter((id): id is string => !!id))];
      let namesById = new Map<string, string>();
      if (leadIds.length > 0) {
        const { data: users, error: usersError } = await supabase
          .from("users")
          .select("id, name")
          .in("id", leadIds);
        if (usersError) throw usersError;
        namesById = new Map(users.map((u) => [u.id, u.name]));
      }

      return rows.map((r) => ({
        ...r,
        lead: r.lead_user_id ? { name: namesById.get(r.lead_user_id) ?? "" } : null,
      })) as unknown as CreativeListRow[];
    },
    enabled: !!projectId,
  });
}
