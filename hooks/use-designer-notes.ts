"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Notes for Designer (phase112, direct instruction): the post's overall
// note and one per image, the team's only, so in their own table rather
// than on the post a Client can read. Kept as versions, as captions are
// (phase117): Save to V{n} changes the latest, Save as V{n+1} adds one.
// Design with Frank's Use This fills them.
export interface DesignerNotes {
  overall: string;
  slides: string[];
}

export interface DesignerNoteVersion extends DesignerNotes {
  id: string;
  versionNo: number;
  createdAt: string;
  editedAt: string | null;
}

// What a window last knew: the latest version as it loaded or last saved
// it (none on a post without notes yet), to catch someone else's save.
export interface KnownNotes extends DesignerNotes {
  versionId: string | null;
  stamp: string | null;
}

const EMPTY: DesignerNotes = { overall: "", slides: [] };
export const NO_NOTES: KnownNotes = { ...EMPTY, versionId: null, stamp: null };

export const knownFrom = (v: DesignerNoteVersion | null | undefined): KnownNotes =>
  v ? { overall: v.overall, slides: v.slides, versionId: v.id, stamp: v.editedAt ?? v.createdAt } : NO_NOTES;

// Trailing empty slides don't count as a change.
const tidy = (n: DesignerNotes) =>
  JSON.stringify({
    overall: n.overall.trim(),
    slides: n.slides.map((t) => t.trim()).filter((t, i, all) => t || all.slice(i).some(Boolean)),
  });
export const sameNotes = (a: DesignerNotes, b: DesignerNotes) => tidy(a) === tidy(b);

const COLUMNS = "id, creative_id, version_no, overall, slides, created_at, edited_at";
type Row = { id: string; creative_id: string; version_no: number; overall: string; slides: string[] | null; created_at: string; edited_at: string | null };
const toVersion = (r: Row): DesignerNoteVersion => ({
  id: r.id,
  versionNo: r.version_no,
  overall: r.overall,
  slides: r.slides ?? [],
  createdAt: r.created_at,
  editedAt: r.edited_at,
});

// One post's versions, oldest first. The team only (RLS): a Client gets none.
export function useDesignerNoteVersions(creativeId: string | null | undefined) {
  return useQuery({
    queryKey: ["designer-notes", creativeId],
    queryFn: async (): Promise<DesignerNoteVersion[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("designer_note_versions")
        .select(COLUMNS)
        .eq("creative_id", creativeId!)
        .order("version_no", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Row[]).map(toVersion);
    },
    enabled: !!creativeId,
  });
}

// One post's notes as they stand: its latest version.
export function useDesignerNotes(creativeId: string | null | undefined) {
  const q = useDesignerNoteVersions(creativeId);
  const latest = q.data?.[q.data.length - 1];
  return { ...q, data: q.data ? (latest ? { overall: latest.overall, slides: latest.slides } : EMPTY) : undefined };
}

export interface PostNotes extends DesignerNotes {
  versionNo: number;
  // Earlier versions, newest first, for the table's hover.
  earlier: { versionNo: number; overall: string }[];
}

// A project table's notes, by post, for its Notes for Designer column: the
// latest version, and the ones before it. Keyed by the project, so a save
// anywhere refreshes the table.
export function useProjectDesignerNotes(projectId: string, creativeIds: string[], enabled: boolean) {
  return useQuery({
    queryKey: ["designer-notes-project", projectId, creativeIds.join(",")],
    queryFn: async (): Promise<Record<string, PostNotes>> => {
      if (!creativeIds.length) return {};
      const supabase = createClient();
      const { data, error } = await supabase
        .from("designer_note_versions")
        .select(COLUMNS)
        .in("creative_id", creativeIds)
        .order("version_no", { ascending: false });
      if (error) throw error;
      const out: Record<string, PostNotes> = {};
      for (const r of (data ?? []) as Row[]) {
        const have = out[r.creative_id];
        if (!have) out[r.creative_id] = { overall: r.overall, slides: r.slides ?? [], versionNo: r.version_no, earlier: [] };
        else have.earlier.push({ versionNo: r.version_no, overall: r.overall });
      }
      return out;
    },
    enabled,
  });
}

// Someone else saved the notes while this window had them open: who, and
// theirs, rather than writing over them.
export class DesignerNotesChangedError extends Error {
  constructor(
    public byName: string | null,
    public theirs: KnownNotes,
  ) {
    super(`${byName ?? "Someone"} changed the Notes for Designer while you had them open.`);
  }
}

// Saves the notes: into the latest version ("current") or as the next
// ("new"), only if the latest is still what this window last knew, else
// who changed it. A blocked write returns no row, so it's checked.
export function useSaveDesignerNotes(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      creativeId,
      notes,
      known,
      mode,
    }: {
      creativeId: string;
      notes: DesignerNotes;
      known: KnownNotes;
      mode: "new" | "current";
    }): Promise<KnownNotes> => {
      const supabase = createClient();
      const {
        data: { user: me },
      } = await supabase.auth.getUser();
      if (!me) throw new Error("Not signed in");
      const { data: latestRow, error: latestError } = await supabase
        .from("designer_note_versions")
        .select(`${COLUMNS}, created_by, edited_by`)
        .eq("creative_id", creativeId)
        .order("version_no", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestError) throw latestError;
      const latest = latestRow ? toVersion(latestRow as Row) : null;
      const theirs = knownFrom(latest);
      if (theirs.versionId !== known.versionId || theirs.stamp !== known.stamp) {
        const by = (latestRow?.edited_by ?? latestRow?.created_by ?? null) as string | null;
        if (by !== me.id) {
          const { data: who } = by ? await supabase.from("users").select("name").eq("id", by).maybeSingle() : { data: null };
          throw new DesignerNotesChangedError((who?.name as string | undefined) ?? null, theirs);
        }
      }
      const overall = notes.overall.trim();
      if (mode === "current" && latest) {
        const { data: at, error } = await supabase.rpc("update_designer_note_version", {
          p_version_id: latest.id,
          p_overall: overall,
          p_slides: notes.slides,
        });
        if (error) throw error;
        return { overall, slides: notes.slides, versionId: latest.id, stamp: at as string };
      }
      const { data, error } = await supabase
        .from("designer_note_versions")
        .insert({
          creative_id: creativeId,
          version_no: (latest?.versionNo ?? 0) + 1,
          overall,
          slides: notes.slides,
          created_by: me.id,
        })
        .select(COLUMNS);
      if (error) {
        // Someone else's version took that number first.
        if (error.code === "23505") throw new DesignerNotesChangedError(null, theirs);
        throw error;
      }
      if (!data?.length) throw new Error("You don't have permission to save this post's Notes for Designer.");
      return knownFrom(toVersion(data[0] as Row));
    },
    onSuccess: async (_saved, { creativeId }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["designer-notes", creativeId] }),
        queryClient.invalidateQueries({ queryKey: ["designer-notes-project", projectId] }),
      ]);
    },
  });
}
