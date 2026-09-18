"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { CopyVersionRow } from "./use-copy-versions";

// Every save creates a new copy version rather than updating one in place
// (frank-schema.docx — "every copy upload... creates a new copy version").
// slide_text carries over untouched; this is the caption/headline/cta
// layer, the Brief panel's Text-on-Image editor is the other one.
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
          slide_text: latest?.slide_text ?? null,
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
    // the creative-version upload hook.
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["copy-versions", creativeId] });
    },
  });
}
