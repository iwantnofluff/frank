"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface BriefFields {
  name: string;
  formats: string[]; // the first is the main format
  // The post's Team, in the order picked (phase87).
  teamUserIds: string[];
  concept: string;
  // Every reference link (phase58), already tidied.
  referenceUrls: string[];
  slideCount: number | null; // carousels only
  // Exactly one side is meaningful, matching the project's own delivery
  // mode (fixed at the project level, never edited here) — the caller
  // decides which, same convention as useCreateCreative.
  scheduledAt: string | null;
  destination: string | null;
  dueOn: string | null;
}

// The post as someone else left it, when it changed while it was open
// (phase82): who, when, and its brief now, for the window to compare.
export class PostChangedError extends Error {
  constructor(
    public byName: string | null,
    public at: string,
    public theirs: BriefFields & { updatedAt: string },
  ) {
    super(`${byName ?? "Someone"} changed this post while you had it open.`);
  }
}

// Direct instruction: name/format/lead/schedule are now editable after
// creation too, not just concept/reference link — reverses the original
// New Brief modal's own documented scope (docs/parity-gaps.md, "Content
// Type / Format selects... changing a creative's format after creation
// isn't a decision this pass can make"), done knowingly this time.
// approach_notes lives on this same row but isn't writable through this
// hook — it's system-generated (app/api/ai/wiifm-note, re-derived from
// whatever copy version was last saved), not brief metadata a human edits.
export function useUpdateBrief(creativeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    // expectedUpdatedAt: when the post last changed as the window opened it
    // (phase82). Saved only if it still matches; null saves regardless (Use
    // Mine, after seeing someone else's). Gives back the new time.
    mutationFn: async ({ expectedUpdatedAt, ...fields }: BriefFields & { expectedUpdatedAt?: string | null }): Promise<string> => {
      const supabase = createClient();
      // RLS silently returns zero rows for a blocked update rather than an
      // error — only surfaced if a row is asked back via .select(). Without
      // it, a non-staff caller's blocked save reads as a no-op "success"
      // (see useUpdateAgencyBranding for the same guard).
      // A fresh save each time it's tried, only if the post is still as it
      // was at `at` (none: whatever it is).
      const save = (at: string | null | undefined) => {
        let q = supabase
          .from("creatives")
          .update({
          name: fields.name.trim(),
          format: fields.formats[0],
          formats: fields.formats,
          team_user_ids: fields.teamUserIds,
          concept: fields.concept.trim() || null,
          reference_urls: fields.referenceUrls,
          slide_count: fields.slideCount,
          scheduled_at: fields.scheduledAt,
          destination: fields.destination,
          due_on: fields.dueOn,
        })
          .eq("id", creativeId);
        if (at) q = q.eq("updated_at", at);
        return q.select("id, updated_at").maybeSingle();
      };
      const { data, error } = await save(expectedUpdatedAt);

      if (error) throw error;
      if (!data) {
        // Changed since it was opened, or not yours to change: which.
        const { data: now } = await supabase
          .from("creatives")
          .select("name, format, formats, team_user_ids, concept, reference_urls, slide_count, scheduled_at, destination, due_on, updated_at, updated_by")
          .eq("id", creativeId)
          .maybeSingle();
        // Changed since, but by this same person (another part of the
        // window, the stage): nothing of anyone else's to lose, so saved.
        const {
          data: { user: me },
        } = await supabase.auth.getUser();
        if (now && expectedUpdatedAt && now.updated_at !== expectedUpdatedAt && now.updated_by === me?.id) {
          const { data: again, error: againError } = await save(now.updated_at as string);
          if (againError) throw againError;
          if (again) return again.updated_at as string;
        }
        if (now && expectedUpdatedAt && now.updated_at !== expectedUpdatedAt) {
          const { data: who } = now.updated_by
            ? await supabase.from("users").select("name").eq("id", now.updated_by).maybeSingle()
            : { data: null };
          throw new PostChangedError((who?.name as string | undefined) ?? null, now.updated_at as string, {
            name: now.name as string,
            formats: ((now.formats as string[] | null)?.length ? now.formats : [now.format]) as string[],
            teamUserIds: (now.team_user_ids as string[] | null) ?? [],
            concept: (now.concept as string | null) ?? "",
            referenceUrls: (now.reference_urls as string[] | null) ?? [],
            slideCount: (now.slide_count as number | null) ?? null,
            scheduledAt: (now.scheduled_at as string | null) ?? null,
            destination: (now.destination as string | null) ?? null,
            dueOn: (now.due_on as string | null) ?? null,
            updatedAt: now.updated_at as string,
          });
        }
        throw new Error("You don't have permission to edit this brief.");
      }
      return data.updated_at as string;
    },
    // The project table lists the same fields (name, formats,
    // date), so its list is refreshed too — before, an edit only showed
    // in the table after a reload.
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["creative", creativeId] }),
        queryClient.invalidateQueries({ queryKey: ["creatives"] }),
      ]);
    },
  });
}
