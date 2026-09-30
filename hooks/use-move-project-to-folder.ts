"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// folderId null means "no folder" (back to the flat, unfiled list) —
// projects_check_folder_client (phase22_project_folders.sql) rejects a
// folder that doesn't belong to this project's own client.
export function useMoveProjectToFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      folderId,
    }: {
      projectId: string;
      clientId: string;
      folderId: string | null;
    }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("projects")
        .update({ folder_id: folderId })
        .eq("id", projectId)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error("You don't have permission to move this project.");
      }
    },
    onSuccess: (_data, { clientId }) => {
      queryClient.invalidateQueries({ queryKey: ["projects", clientId] });
    },
  });
}
