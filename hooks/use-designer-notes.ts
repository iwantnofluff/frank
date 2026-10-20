"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Notes for Designer (phase112, direct instruction): the post's overall
// note and one per image, the team's only, so in their own table rather
// than on the post a Client can read. Design with Frank's Use This fills
// them.
export interface DesignerNotes {
  overall: string;
  slides: string[];
}

const EMPTY: DesignerNotes = { overall: "", slides: [] };

// Trailing empty slides don't count as a change.
const tidy = (n: DesignerNotes) =>
  JSON.stringify({
    overall: n.overall.trim(),
    slides: n.slides.map((t) => t.trim()).filter((t, i, all) => t || all.slice(i).some(Boolean)),
  });
export const sameNotes = (a: DesignerNotes, b: DesignerNotes) => tidy(a) === tidy(b);

// One post's notes. The team only (RLS): a Client gets none.
export function useDesignerNotes(creativeId: string | null | undefined) {
  return useQuery({
    queryKey: ["designer-notes", creativeId],
    queryFn: async (): Promise<DesignerNotes> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("designer_notes")
        .select("overall, slides")
        .eq("creative_id", creativeId!)
        .maybeSingle();
      if (error) throw error;
      return data ? { overall: data.overall as string, slides: (data.slides as string[]) ?? [] } : EMPTY;
    },
    enabled: !!creativeId,
  });
}

// A project table's notes, by post, for its Notes for Designer column.
// Keyed by the project, so a save anywhere refreshes the table.
export function useProjectDesignerNotes(projectId: string, creativeIds: string[], enabled: boolean) {
  return useQuery({
    queryKey: ["designer-notes-project", projectId, creativeIds.join(",")],
    queryFn: async (): Promise<Record<string, DesignerNotes>> => {
      if (!creativeIds.length) return {};
      const supabase = createClient();
      const { data, error } = await supabase
        .from("designer_notes")
        .select("creative_id, overall, slides")
        .in("creative_id", creativeIds);
      if (error) throw error;
      return Object.fromEntries(
        (data ?? []).map((d) => [d.creative_id as string, { overall: d.overall as string, slides: (d.slides as string[]) ?? [] }]),
      );
    },
    enabled,
  });
}

// Someone else saved the notes while this window had them open: who, and
// theirs, rather than writing over them.
export class DesignerNotesChangedError extends Error {
  constructor(
    public byName: string | null,
    public theirs: DesignerNotes,
  ) {
    super(`${byName ?? "Someone"} changed the Notes for Designer while you had them open.`);
  }
}

// Saved with the brief: only if they're still what this window last knew
// (`known`), else who changed them. A blocked write returns no row, so
// it's checked.
export function useSaveDesignerNotes(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ creativeId, notes, known }: { creativeId: string; notes: DesignerNotes; known: DesignerNotes }) => {
      const supabase = createClient();
      const {
        data: { user: me },
      } = await supabase.auth.getUser();
      if (!me) throw new Error("Not signed in");
      const { data: now } = await supabase
        .from("designer_notes")
        .select("overall, slides, updated_by")
        .eq("creative_id", creativeId)
        .maybeSingle();
      const theirs: DesignerNotes = now ? { overall: now.overall as string, slides: (now.slides as string[]) ?? [] } : EMPTY;
      if (now && !sameNotes(theirs, known) && now.updated_by !== me.id) {
        const { data: who } = now.updated_by
          ? await supabase.from("users").select("name").eq("id", now.updated_by).maybeSingle()
          : { data: null };
        throw new DesignerNotesChangedError((who?.name as string | undefined) ?? null, theirs);
      }
      const { data, error } = await supabase
        .from("designer_notes")
        .upsert({
          creative_id: creativeId,
          overall: notes.overall.trim(),
          slides: notes.slides,
          updated_by: me.id,
          updated_at: new Date().toISOString(),
        })
        .select("creative_id");
      if (error) throw error;
      if (!data?.length) throw new Error("You don't have permission to save this post's Notes for Designer.");
      return creativeId;
    },
    onSuccess: async (creativeId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["designer-notes", creativeId] }),
        queryClient.invalidateQueries({ queryKey: ["designer-notes-project", projectId] }),
      ]);
    },
  });
}
