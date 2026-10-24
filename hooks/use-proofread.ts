"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { ProofreadSuggestion } from "@/lib/proofread";

// A saved version's proofread (phase121): its suggestions and what's been
// ignored. The team only.
export interface Proofread {
  suggestions: ProofreadSuggestion[];
  ignored: string[];
}

export function useProofread(versionId: string | null | undefined) {
  return useQuery({
    queryKey: ["proofread", versionId],
    queryFn: async (): Promise<Proofread | null> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("proofreads")
        .select("suggestions, ignored")
        .eq("version_id", versionId!)
        .maybeSingle();
      if (error) throw error;
      return data ? { suggestions: (data.suggestions as ProofreadSuggestion[]) ?? [], ignored: (data.ignored as string[]) ?? [] } : null;
    },
    enabled: !!versionId,
  });
}

// Proofreads a version just saved (app/api/ai/proofread).
export function useRunProofread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ kind, versionId }: { kind: "copy" | "production"; versionId: string }) => {
      const res = await fetch("/api/ai/proofread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, versionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Frank couldn't proofread it");
      return data.suggestions as ProofreadSuggestion[];
    },
    onSettled: (_d, _e, { versionId }) => queryClient.invalidateQueries({ queryKey: ["proofread", versionId] }),
  });
}

// Ignore: kept with the version, so it stays ignored.
export function useIgnoreSuggestion(versionId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const supabase = createClient();
      const now = queryClient.getQueryData<Proofread | null>(["proofread", versionId]);
      const ignored = [...new Set([...(now?.ignored ?? []), ...ids])];
      const { data, error } = await supabase.from("proofreads").update({ ignored }).eq("version_id", versionId!).select("version_id");
      if (error) throw error;
      // A blocked write reports no error, only no row.
      if (!data?.length) throw new Error("Couldn't ignore it");
    },
    onMutate: (ids) => {
      queryClient.setQueryData<Proofread | null>(["proofread", versionId], (p) =>
        p ? { ...p, ignored: [...new Set([...p.ignored, ...ids])] } : p,
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["proofread", versionId] }),
  });
}
