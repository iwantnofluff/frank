"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface CreateCreativeInput {
  name: string;
  // Keys, e.g. "ig_feed" — never labels. The first is the main format.
  formats: string[];
  // The post's Team, in the order picked (phase87); the database keeps the
  // first as lead_user_id.
  teamUserIds: string[];
  concept: string;
  // Every reference link (phase58), already tidied.
  referenceUrls: string[];
  slideCount: number | null; // carousels only
  cx: Record<string, string | number | boolean | null>;
  // Exactly one side is meaningful, matching the project's delivery —
  // the caller decides which, this hook doesn't guess.
  scheduledAt: string | null;
  destination: string | null;
  dueOn: string | null;
  // Typed straight into a new row of the table (direct instruction): a
  // video's VO, Text on Image, and copy fields, saved as its first copy
  // version. The New Post window adds these on its Content tab instead.
  voiceover?: string;
  slideText?: string[];
  copyFields?: Record<string, string>;
  // The overall Notes for Designer, the team's own (phase112).
  designerNotes?: string;
}

// The first code path in this app that creates a creatives row. Verified
// empirically before this was written (docs/parity-gaps.md, "New Brief"):
// creatives_set_agency_id derives agency_id from project_id on insert, so
// it's never set here; stage defaults to 1; a real client-role session is
// rejected outright by creatives_insert's staff-only RLS check.
export function useCreateCreative(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateCreativeInput) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      // Computed from the project's current max, not the column's bare
      // default of 0 — verified empirically to land where expected.
      const { data: maxRows, error: maxError } = await supabase
        .from("creatives")
        .select("position")
        .eq("project_id", projectId)
        .order("position", { ascending: false })
        .limit(1);
      if (maxError) throw maxError;
      const position = (maxRows?.[0]?.position ?? -1) + 1;

      const { data: creative, error: creativeError } = await supabase
        .from("creatives")
        .insert({
          project_id: projectId,
          name: input.name,
          // An idea or concept can be made without one (phase114).
          format: input.formats[0] ?? null,
          formats: input.formats,
          team_user_ids: input.teamUserIds,
          concept: input.concept.trim() || null,
          reference_urls: input.referenceUrls,
          slide_count: input.slideCount,
          // approach_notes is left null here — system-generated from copy
          // once it exists (app/api/ai/wiifm-note), not settable at
          // brief-creation time when there's no copy yet to derive it from.
          scheduled_at: input.scheduledAt,
          destination: input.destination,
          due_on: input.dueOn,
          position,
          cx: input.cx,
          ...(input.voiceover?.trim() ? { voiceover: input.voiceover.trim() } : {}),
          ...(input.slideText?.some((t) => t.trim()) ? { slide_text: input.slideText.map((t) => t.trim()) } : {}),
          created_by: user.id,
        })
        .select("id")
        .single();
      if (creativeError) throw creativeError;

      // The row's Notes for Designer, when typed.
      if (input.designerNotes?.trim()) {
        const { error: notesError } = await supabase
          .from("designer_notes")
          .insert({ creative_id: creative.id, overall: input.designerNotes.trim(), slides: [], updated_by: user.id });
        if (notesError) throw new Error(`The post was added, but its Notes for Designer couldn't be saved: ${notesError.message}`);
      }
      // The row's copy, as version 1, when any was typed.
      const copy = Object.fromEntries(Object.entries(input.copyFields ?? {}).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]));
      if (Object.keys(copy).length) {
        const { error: copyError } = await supabase
          .from("copy_versions")
          .insert({ creative_id: creative.id, version_no: 1, fields: copy, source: "upload", created_by: user.id });
        if (copyError) throw new Error(`The post was added, but its copy couldn't be saved: ${copyError.message}`);
      }

      // No copy version here (direct instruction): the caption and Text
      // on Image are both written on the Content tab, and V1 is only made
      // once some of it is.

      return creative.id as string;
    },
    // ShareModal reads this same query for its eligibility counts, and
    // can't be assumed mounted (and thus "active") at the moment a brief
    // is created — refetchType: "all" keeps the cache itself current
    // regardless, so a share link made right after New Brief never
    // undercounts the piece that was just added.
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["creatives", projectId],
          refetchType: "all",
        }),
        // The table's Caption and Alt Text columns, for a row's own copy.
        queryClient.invalidateQueries({ queryKey: ["copy-versions-by-creative"], refetchType: "all" }),
      ]);
    },
  });
}
