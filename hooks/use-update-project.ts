"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// One instance handles every row on the page — the target id travels in
// the mutate-time payload rather than being baked into the hook call.
// clientId travels alongside it purely to invalidate the list query it
// lives under (use-create-project.ts's own invalidation shape).
export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      name,
      type,
    }: {
      projectId: string;
      clientId: string;
      name: string;
      type: string | null;
    }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("projects")
        .update({ name: name.trim(), type })
        .eq("id", projectId)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error("You don't have permission to edit this project.");
      }
    },
    onSuccess: (_data, { projectId, clientId }) => {
      queryClient.invalidateQueries({ queryKey: ["projects", clientId] });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    },
  });
}
