"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface ProjectPatch {
  name?: string;
  type?: string | null;
  // Project Profile (phase46). Delivery isn't here: it never changes once
  // a project is made (phase48).
  description?: string | null;
  due_on?: string | null;
  // The project's picture (phase56); null goes back to the initials.
  icon?: string | null;
}

// One instance handles every row on the page — the target id travels in
// the mutate-time payload rather than being baked into the hook call.
// clientId travels alongside it purely to invalidate the list query it
// lives under (use-create-project.ts's own invalidation shape). Only the
// fields given are written.
export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      name,
      type,
      description,
      due_on,
      icon,
    }: ProjectPatch & {
      projectId: string;
      clientId: string;
    }) => {
      const supabase = createClient();
      // Fields left undefined drop out of the request body.
      const { data, error } = await supabase
        .from("projects")
        .update({ name: name?.trim(), type, description, due_on, icon })
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
