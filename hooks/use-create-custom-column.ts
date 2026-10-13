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

export interface NewColumn {
  label: string;
  type: CustomColumnType;
  options: CustomColumnOption[] | null;
  position: number;
}

// Adds one of a project's columns and returns its id (phase96: Owners and
// Admins; the database refuses anyone else).
export async function createCustomColumn(projectId: string, column: NewColumn): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("custom_columns")
    .insert({ project_id: projectId, key: slugify(column.label), ...column })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

// A dropdown's options from "A, B, C".
export function parseOptions(text: string): CustomColumnOption[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => ({ value: s.toLowerCase().replace(/[^a-z0-9]+/g, "_"), label: s }));
}

export function useCreateCustomColumn(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (column: NewColumn) => createCustomColumn(projectId, column),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["custom-columns", projectId],
      });
    },
  });
}
