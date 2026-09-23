"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { uploadKnowledgeAsset } from "@/lib/upload-knowledge-asset";

export function useCreateAgencyKnowledgeEntry(agencyId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ title, body }: { title: string; body: string }) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from("agency_knowledge_entries").insert({
        agency_id: agencyId,
        kind: "text",
        title,
        body,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agency-knowledge", agencyId] });
    },
  });
}

export function useCreateAgencyKnowledgeFile(agencyId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ title, file }: { title: string; file: File }) => {
      if (!agencyId) throw new Error("No agency");
      const assetId = await uploadKnowledgeAsset(agencyId, file);

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from("agency_knowledge_entries").insert({
        agency_id: agencyId,
        kind: "file",
        title,
        asset_id: assetId,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agency-knowledge", agencyId] });
    },
  });
}

export function useDeleteAgencyKnowledgeEntry(agencyId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // Same RLS silent-zero-rows shape every other mutation in this app
      // guards against — see use-knowledge-mutations.ts for the identical
      // pattern this was copied from.
      const { data, error } = await supabase
        .from("agency_knowledge_entries")
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("You don't have permission to remove this entry.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agency-knowledge", agencyId] });
    },
  });
}
