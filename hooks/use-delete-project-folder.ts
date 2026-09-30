"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// A real delete, not archive — a folder is just an organisational label,
// nothing irreplaceable lives under it. Its own projects un-file (schema's
// own `on delete set null` on projects.folder_id) rather than being
// deleted or blocked.
export function useDeleteProjectFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ folderId }: { folderId: string; clientId: string }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("project_folders")
        .delete()
        .eq("id", folderId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error("You don't have permission to delete this folder.");
      }
    },
    onSuccess: (_data, { clientId }) => {
      queryClient.invalidateQueries({ queryKey: ["project-folders", clientId] });
      queryClient.invalidateQueries({ queryKey: ["projects", clientId] });
    },
  });
}
