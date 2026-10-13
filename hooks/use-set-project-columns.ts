"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { createCustomColumn } from "./use-create-custom-column";
import type { ColumnSpec } from "@/components/project/AddColumnForm";

// A new project's columns (phase96, direct instruction), as set in the New
// Project window's Columns step: its own columns made (keyed "new:<n>"
// there, `cx:<id>` once saved), then the Main Table's order, hidden
// columns and renamed built-in columns saved on the project.
export function useSetProjectColumns() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      order,
      hidden,
      labels,
      added,
      builtInLabels,
    }: {
      projectId: string;
      order: string[];
      hidden: string[];
      labels: Record<string, string>;
      added: Record<string, ColumnSpec>;
      // Each built-in column's own name, to keep only real renames.
      builtInLabels: Record<string, string>;
    }) => {
      const keyFor: Record<string, string> = {};
      let position = 0;
      for (const key of order) {
        const spec = added[key];
        if (!spec) continue;
        const id = await createCustomColumn(projectId, {
          label: labels[key] ?? spec.label,
          type: spec.type,
          options: spec.options,
          position: position++,
        });
        keyFor[key] = `cx:${id}`;
      }
      const mapKey = (k: string) => keyFor[k] ?? k;
      const columnLabels = Object.fromEntries(
        Object.entries(labels).filter(([k, v]) => builtInLabels[k] !== undefined && v !== builtInLabels[k]),
      );
      const supabase = createClient();
      const { data, error } = await supabase
        .from("projects")
        .update({
          default_column_order: order.map(mapKey),
          default_hidden_columns: hidden.map(mapKey),
          column_labels: columnLabels,
        })
        .eq("id", projectId)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Couldn't save the project's columns");
    },
    onSuccess: (_d, { projectId }) => {
      void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["custom-columns", projectId] });
    },
  });
}
