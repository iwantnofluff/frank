"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { CopyVersionRow } from "./use-copy-versions";

// Text-on-image is part of the copy layer, versioned independently of the
// artwork (frank-schema.docx — "Versions are independent"). Editing it cuts
// a new copy_versions row rather than updating one in place; the existing
// `fields` (caption etc.) carry over untouched.
export function useSaveSlideText(creativeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      slideText,
      latest,
    }: {
      slideText: string[];
      // Only version_no/fields are ever read below — a Pick rather than
      // the full row, so a caller that's tracking a just-created version
      // locally (no real CopyVersionRow to hand back yet) can pass one
      // without fabricating id/source/created_at it doesn't have.
      latest: Pick<CopyVersionRow, "version_no" | "fields"> | null;
    }) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const { error } = await supabase.from("copy_versions").insert({
        creative_id: creativeId,
        version_no: (latest?.version_no ?? 0) + 1,
        fields: latest?.fields ?? {},
        slide_text: slideText,
        source: "in_app_edit",
        created_by: user.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["copy-versions", creativeId],
      });
    },
  });
}
