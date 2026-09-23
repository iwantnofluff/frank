"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { uploadKnowledgeAsset } from "@/lib/upload-knowledge-asset";

export function useCreateKnowledgeEntry(clientId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      section,
      title,
      body,
    }: {
      section: string;
      title: string;
      body: string;
    }) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from("knowledge_entries").insert({
        client_id: clientId,
        section,
        kind: "text",
        title,
        body,
        author_id: user?.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["knowledge-entries", clientId],
      });
    },
  });
}

// agencyId is needed here (unlike the text-only create above) because the
// upload path is {agency_id}/knowledge/{uuid}-{filename} — knowledge_entries
// itself derives its own agency_id from client_id via a trigger, same as
// every other insert in this app, but the Storage path can't reach into a
// trigger to get there first.
export function useCreateKnowledgeFileEntry(clientId: string, agencyId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ section, title, file }: { section: string; title: string; file: File }) => {
      if (!agencyId) throw new Error("No agency");
      const assetId = await uploadKnowledgeAsset(agencyId, file);

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from("knowledge_entries").insert({
        client_id: clientId,
        section,
        kind: "file",
        title,
        asset_id: assetId,
        author_id: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["knowledge-entries", clientId],
      });
    },
  });
}

export function useUpdateKnowledgeEntry(clientId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      title,
      body,
    }: {
      id: string;
      title: string;
      body: string;
    }) => {
      const supabase = createClient();
      // RLS silently returns zero rows for a blocked update rather than an
      // error — only surfaced if a row is asked back via .select() (see
      // useUpdateAgencyBranding for the same guard).
      const { data, error } = await supabase
        .from("knowledge_entries")
        .update({ title, body })
        .eq("id", id)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error("You don't have permission to edit this entry.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["knowledge-entries", clientId],
      });
    },
  });
}

export function useDeleteKnowledgeEntry(clientId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // Same RLS silent-zero-rows shape as an update — a DELETE with no
      // matching row under RLS "succeeds" at deleting nothing, unless a
      // row is asked back via .select().
      const { data, error } = await supabase
        .from("knowledge_entries")
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error("You don't have permission to remove this entry.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["knowledge-entries", clientId],
      });
    },
  });
}
