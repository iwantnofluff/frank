"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface AgencyKnowledgeEntryRow {
  id: string;
  kind: "text" | "file";
  title: string;
  body: string | null;
  asset_id: string | null;
  created_by: string;
  created_at: string;
  asset: { storage_key: string; filename: string; mime_type: string; bytes: number } | null;
  authorName: string;
}

// Two plain queries rather than an `assets(...)` embed — asset_id is
// nullable (every text entry has none), same reasoning as
// hooks/use-comments.ts's author resolution: an embed's join behaviour
// dropping rows for a legitimately-null FK is exactly the bug that already
// bit this app once for a different table.
export function useAgencyKnowledge(agencyId: string | undefined) {
  return useQuery({
    queryKey: ["agency-knowledge", agencyId],
    queryFn: async (): Promise<AgencyKnowledgeEntryRow[]> => {
      const supabase = createClient();
      const { data: rows, error } = await supabase
        .from("agency_knowledge_entries")
        .select("id, kind, title, body, asset_id, created_by, created_at")
        .eq("agency_id", agencyId!)
        .order("created_at");
      if (error) throw error;

      const assetIds = [...new Set(rows.map((r) => r.asset_id).filter((id): id is string => !!id))];
      let assetsById = new Map<string, { storage_key: string; filename: string; mime_type: string; bytes: number }>();
      if (assetIds.length > 0) {
        const { data: assets, error: assetsError } = await supabase
          .from("assets")
          .select("id, storage_key, filename, mime_type, bytes")
          .in("id", assetIds);
        if (assetsError) throw assetsError;
        assetsById = new Map(assets.map((a) => [a.id, a]));
      }

      const authorIds = [...new Set(rows.map((r) => r.created_by))];
      let namesById = new Map<string, string>();
      if (authorIds.length > 0) {
        const { data: authors, error: authorsError } = await supabase
          .from("users")
          .select("id, name")
          .in("id", authorIds);
        if (authorsError) throw authorsError;
        namesById = new Map(authors.map((a) => [a.id, a.name]));
      }

      return rows.map((r) => ({
        ...r,
        asset: r.asset_id ? (assetsById.get(r.asset_id) ?? null) : null,
        authorName: namesById.get(r.created_by) ?? "Someone",
      })) as AgencyKnowledgeEntryRow[];
    },
    enabled: !!agencyId,
  });
}
