"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface CreateCreativeInput {
  name: string;
  format: string; // key, e.g. "ig_feed" — never the label
  leadUserId: string | null;
  concept: string;
  referenceUrl: string;
  approachNotes: string[];
  slideText: string[];
  caption: string;
  cx: Record<string, string | number | boolean | null>;
  // Exactly one side is meaningful, matching the project's delivery —
  // the caller decides which, this hook doesn't guess.
  scheduledAt: string | null;
  destination: string | null;
  dueOn: string | null;
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
          format: input.format,
          lead_user_id: input.leadUserId,
          concept: input.concept.trim() || null,
          reference_url: input.referenceUrl.trim() || null,
          approach_notes: input.approachNotes.map((n) => n.trim()).filter(Boolean),
          scheduled_at: input.scheduledAt,
          destination: input.destination,
          due_on: input.dueOn,
          position,
          cx: input.cx,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (creativeError) throw creativeError;

      const slideText = input.slideText.map((s) => s.trim()).filter(Boolean);
      const caption = input.caption.trim();
      // Copy Options (the prototype's plural draft-caption list) is
      // deliberately not built — see docs/parity-gaps.md — this writes a
      // single caption straight into fields.caption, same insert as
      // useSaveSlideText/useSaveCopyFields use for later edits.
      if (slideText.length > 0 || caption) {
        const { error: copyError } = await supabase.from("copy_versions").insert({
          creative_id: creative.id,
          version_no: 1,
          fields: caption ? { caption } : {},
          slide_text: slideText,
          source: "in_app_edit",
          created_by: user.id,
        });
        if (copyError) throw copyError;
      }

      return creative.id as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creatives", projectId] });
    },
  });
}
