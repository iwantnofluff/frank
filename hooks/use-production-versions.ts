"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// The Production tab's words in versions (phase120, direct instruction):
// the VO, Text on Image and Thumbnail Text on Image, each with its own.
// Saved through save_production_version, which also puts the words on the
// post, where the table, review links and Checks read them. The team only.
export type ProductionField = "voiceover" | "slide_text" | "thumbnail_text";

export interface ProductionVersion {
  id: string;
  field: ProductionField;
  versionNo: number;
  body: string;
  slides: string[];
  createdAt: string;
  editedAt: string | null;
}

export type ProductionVersions = Record<ProductionField, ProductionVersion[]>;

const EMPTY: ProductionVersions = { voiceover: [], slide_text: [], thumbnail_text: [] };

type Row = {
  id: string;
  creative_id: string;
  field: ProductionField;
  version_no: number;
  body: string | null;
  slides: string[] | null;
  created_at: string;
  edited_at: string | null;
};
const toVersion = (r: Row): ProductionVersion => ({
  id: r.id,
  field: r.field,
  versionNo: r.version_no,
  body: r.body ?? "",
  slides: r.slides ?? [],
  createdAt: r.created_at,
  editedAt: r.edited_at,
});
const COLUMNS = "id, creative_id, field, version_no, body, slides, created_at, edited_at";

// One post's, each field newest first.
export function useProductionVersions(creativeId: string | null | undefined) {
  return useQuery({
    queryKey: ["production-versions", creativeId],
    queryFn: async (): Promise<ProductionVersions> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("production_versions")
        .select(COLUMNS)
        .eq("creative_id", creativeId!)
        .order("version_no", { ascending: false });
      if (error) throw error;
      const out: ProductionVersions = { voiceover: [], slide_text: [], thumbnail_text: [] };
      for (const r of (data ?? []) as Row[]) out[r.field].push(toVersion(r));
      return out;
    },
    enabled: !!creativeId,
  });
}

// The table's: each post's VO and Text on Image versions, newest first,
// for their V label and earlier ones on hover.
export function useProjectProductionVersions(projectId: string, creativeIds: string[], enabled: boolean) {
  return useQuery({
    queryKey: ["production-versions-project", projectId, creativeIds.join(",")],
    queryFn: async (): Promise<Record<string, ProductionVersions>> => {
      if (!creativeIds.length) return {};
      const supabase = createClient();
      const { data, error } = await supabase
        .from("production_versions")
        .select(COLUMNS)
        .in("creative_id", creativeIds)
        .in("field", ["voiceover", "slide_text"])
        .order("version_no", { ascending: false });
      if (error) throw error;
      const out: Record<string, ProductionVersions> = {};
      for (const r of (data ?? []) as Row[]) {
        const post = (out[r.creative_id] ??= { voiceover: [], slide_text: [], thumbnail_text: [] });
        post[r.field].push(toVersion(r));
      }
      return out;
    },
    enabled,
  });
}

export const noProductionVersions = EMPTY;

// Someone else saved this field since the window had it: their name, from
// save_production_version's refusal.
export class ProductionChangedError extends Error {}

export function useSaveProduction(creativeId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      field: ProductionField;
      mode: "current" | "new";
      body?: string;
      slides?: string[];
      knownVersionId: string | null;
    }): Promise<{ id: string; versionNo: number }> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("save_production_version", {
        p_creative_id: creativeId,
        p_field: input.field,
        p_mode: input.mode,
        p_body: input.body ?? null,
        p_slides: input.slides ?? [],
        p_known_version_id: input.knownVersionId,
      });
      if (error) {
        if (error.code === "P0409") throw new ProductionChangedError(error.message);
        throw error;
      }
      const r = data as { id: string; version_no: number };
      return { id: r.id, versionNo: r.version_no };
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["production-versions", creativeId] }),
        queryClient.invalidateQueries({ queryKey: ["production-versions-project", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["creative", creativeId] }),
        queryClient.invalidateQueries({ queryKey: ["creatives", projectId] }),
      ]);
    },
  });
}
