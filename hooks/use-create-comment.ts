"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Anchor } from "@/lib/annotations";

export function useCreateComment(creativeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      body,
      parentId,
      visibility,
      creativeVersionId = null,
      copyVersionId = null,
      anchor = null,
    }: {
      body: string;
      parentId: string | null;
      visibility: "private" | "public";
      // Which version this comment was written against — recorded so the
      // UI can grey out feedback that refers to a version nobody is
      // looking at any more. Null for a general, un-anchored comment.
      creativeVersionId?: string | null;
      copyVersionId?: string | null;
      anchor?: Anchor | null;
    }) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      // agency_id is derived server-side from creative_id; visibility for a
      // client-side author is force-corrected to 'public' there too — this
      // is what the author sees requested, not what's guaranteed to land.
      const { error } = await supabase.from("comments").insert({
        creative_id: creativeId,
        parent_id: parentId,
        author_id: user.id,
        body,
        visibility,
        creative_version_id: creativeVersionId,
        copy_version_id: copyVersionId,
        anchor,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", creativeId] });
    },
  });
}
