"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// One call, one transaction (move_project_to_client, phase27): the project
// changes client, leaves its folder, and its share links are revoked —
// never one without the others.
export function useMoveProjectToClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { projectId: string; fromClientId: string; toClientId: string }) => {
      const supabase = createClient();
      const { error } = await supabase.rpc("move_project_to_client", {
        p_project_id: input.projectId,
        p_client_id: input.toClientId,
      });
      if (error) throw error;
    },
    onSuccess: async (_data, { projectId, fromClientId, toClientId }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects", fromClientId] }),
        queryClient.invalidateQueries({ queryKey: ["projects", toClientId] }),
        queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["client-list-stats"] }),
      ]);
    },
  });
}
