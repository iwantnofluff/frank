"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface CreativeRow {
  id: string;
  agency_id: string;
  project_id: string;
  name: string;
  format: string;
  stage: number;
  exception: "changes_requested" | "rejected" | null;
  lead_user_id: string | null;
  // Everyone on the post, in the order picked (phase87).
  team_user_ids: string[];
  scheduled_at: string | null;
  formats: string[]; // every format, main first (phase29)
  destination: string | null;
  due_on: string | null;
  concept: string | null;
  reference_url: string | null;
  // Every reference link, in order (phase58); reference_url is no longer written.
  reference_urls: string[];
  slide_count: number | null; // carousels only (phase31)
  // Text on Image, one entry per slide (phase57: on the post, not versions).
  slide_text: string[];
  approach_notes: string[] | null;
  // When its artwork was removed after going live (phase60).
  artwork_removed_at: string | null;
  // The table's own fields (Funnel, Notes for Designer, custom columns).
  cx: Record<string, string | number | boolean | null> | null;
  // When it last changed, and who by (phase82): a save checks it still
  // matches what was opened, so nobody's changes are silently undone.
  updated_at: string;
  updated_by: string | null;
  projects: {
    id: string;
    name: string;
    delivery: "scheduled" | "continuous";
    client_id: string;
    clients: { name: string } | null;
  } | null;
}

export function useCreative(creativeId: string) {
  return useQuery({
    queryKey: ["creative", creativeId],
    queryFn: async (): Promise<CreativeRow> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("creatives")
        .select(
          "id, agency_id, project_id, name, format, stage, exception, lead_user_id, team_user_ids, scheduled_at, formats, destination, due_on, concept, reference_url, reference_urls, slide_count, slide_text, approach_notes, artwork_removed_at, cx, updated_at, updated_by, projects(id, name, delivery, client_id, clients(name))",
        )
        .eq("id", creativeId)
        .single();

      if (error) throw error;
      return data as unknown as CreativeRow;
    },
    enabled: !!creativeId,
  });
}
