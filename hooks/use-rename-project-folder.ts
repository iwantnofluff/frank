"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export function useRenameProjectFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      folderId,
      name,
    }: {
      folderId: string;
      clientId: string;
      name: string;
    }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("project_folders")
        .update({ name: name.trim() })
        .eq("id", folderId)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error("You don't have permission to rename this folder.");
      }
    },
    onSuccess: (_data, { clientId }) => {
      queryClient.invalidateQueries({ queryKey: ["project-folders", clientId] });
    },
  });
}
