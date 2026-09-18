"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { CustomColumnOption, CustomColumnType } from "./use-custom-columns";

function slugify(label: string) {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  // Suffixed so two columns with the same label don't collide against the
  // (project_id, key) unique constraint.
  return `${base || "column"}_${Date.now().toString(36)}`;
}

export function useCreateCustomColumn(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      label,
      type,
      options,
      position,
    }: {
      label: string;
      type: CustomColumnType;
      options: CustomColumnOption[] | null;
      position: number;
    }) => {
      const supabase = createClient();
      const { error } = await supabase.from("custom_columns").insert({
        project_id: projectId,
        key: slugify(label),
        label,
        type,
        options,
        position,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["custom-columns", projectId],
      });
    },
  });
}
