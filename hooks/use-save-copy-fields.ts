"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { CopyVersionRow } from "./use-copy-versions";

// Every save creates a new copy version rather than updating one in place
// (frank-schema.docx — "every copy upload... creates a new copy version").
// The caption/headline/cta fields only. Text on Image is on the post
// itself, saved on its own (phase57, useSaveSlideText), so a version only
// ever holds copy.
export function useSaveCopyFields(creativeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      fields,
      latest,
    }: {
      fields: Record<string, string>;
      latest: CopyVersionRow | null;
    }) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const { data, error } = await supabase
        .from("copy_versions")
        .insert({
          creative_id: creativeId,
          version_no: (latest?.version_no ?? 0) + 1,
          fields: { ...(latest?.fields ?? {}), ...fields },
          source: "upload",
          created_by: user.id,
        })
        .select("id")
        .single();
      if (error) throw error;

      return data.id as string;
    },
    // Awaited so the caller's own onSuccess (selecting the new version as
    // active) only runs once the list actually contains it — same fix as
    // the creative-version upload hook. The table's Caption column reads
    // its own list, refreshed with it (reported directly: a new caption
    // only showed in the table after a reload).
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["copy-versions", creativeId] }),
        queryClient.invalidateQueries({ queryKey: ["copy-versions-by-creative"], refetchType: "all" }),
      ]);
    },
  });
}
