"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

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
      const { error } = await supabase
        .from("knowledge_entries")
        .update({ title, body })
        .eq("id", id);

      if (error) throw error;
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
      const { error } = await supabase
        .from("knowledge_entries")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["knowledge-entries", clientId],
      });
    },
  });
}
