"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Renaming one of a project's columns (phase96, direct instruction: for
// the project everywhere): its own column (`cx:<id>`) in place, a built-in
// one in the project's column_labels. Owners and Admins; the database
// refuses anyone else, and so does this, if nothing changed.
export function useRenameColumn(projectId: string, columnLabels: Record<string, string>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, label }: { key: string; label: string }) => {
      const supabase = createClient();
      const { data, error } = key.startsWith("cx:")
        ? await supabase.from("custom_columns").update({ label }).eq("id", key.slice(3)).select("id")
        : await supabase
            .from("projects")
            .update({ column_labels: { ...columnLabels, [key]: label } })
            .eq("id", projectId)
            .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Only Owners and Admins can rename a column.");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["custom-columns", projectId] });
    },
  });
}
