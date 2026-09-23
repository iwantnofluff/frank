"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface KnowledgeEntryRow {
  id: string;
  section: string;
  kind: "text" | "file" | "link" | "image";
  title: string;
  body: string | null;
  url: string | null;
  asset_id: string | null;
  created_at: string;
  asset: { storage_key: string; filename: string; mime_type: string } | null;
}

// Two plain queries rather than an `assets(...)` embed — same reasoning as
// use-agency-knowledge.ts and hooks/use-comments.ts: asset_id is nullable
// (only file/image entries have one), and an embed's join behaviour drops
// rows for a legitimately-null FK.
export function useKnowledgeEntries(clientId: string) {
  return useQuery({
    queryKey: ["knowledge-entries", clientId],
    queryFn: async (): Promise<KnowledgeEntryRow[]> => {
      const supabase = createClient();
      const initial = await supabase
        .from("knowledge_entries")
        .select("id, section, kind, title, body, url, asset_id, created_at")
        .eq("client_id", clientId)
        .order("created_at");

      // 42703 = undefined_column: phase11_agency_knowledge.sql's asset_id
      // column not applied to this database yet. Falls back to the
      // pre-migration column list rather than breaking every existing
      // text note (this hook's already-working, months-old feature) for
      // however long that migration takes to land — see docs/parity-gaps.md.
      let rows: { id: string; section: string; kind: string; title: string; body: string | null; url: string | null; asset_id: string | null; created_at: string }[];
      if (initial.error?.code === "42703") {
        const fallback = await supabase
          .from("knowledge_entries")
          .select("id, section, kind, title, body, url, created_at")
          .eq("client_id", clientId)
          .order("created_at");
        if (fallback.error) throw fallback.error;
        rows = fallback.data.map((r) => ({ ...r, asset_id: null }));
      } else {
        if (initial.error) throw initial.error;
        rows = initial.data;
      }

      const assetIds = [...new Set(rows.map((r) => r.asset_id).filter((id): id is string => !!id))];
      let assetsById = new Map<string, { storage_key: string; filename: string; mime_type: string }>();
      if (assetIds.length > 0) {
        const { data: assets, error: assetsError } = await supabase
          .from("assets")
          .select("id, storage_key, filename, mime_type")
          .in("id", assetIds);
        if (assetsError) throw assetsError;
        assetsById = new Map(assets.map((a) => [a.id, a]));
      }

      return rows.map((r) => ({
        ...r,
        asset: r.asset_id ? (assetsById.get(r.asset_id) ?? null) : null,
      })) as KnowledgeEntryRow[];
    },
    enabled: !!clientId,
  });
}
