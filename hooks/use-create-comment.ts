"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Anchor } from "@/lib/annotations";
import { notifyClientActivity } from "@/lib/notify-client-activity";
import { classifyComment } from "@/lib/ai/classify-comment-client";
import type { CommentRow } from "./use-comments";
import type { MyMembership } from "./use-my-membership";

type NewComment = {
  body: string;
  parentId: string | null;
  visibility: "private" | "public";
  creativeVersionId?: string | null;
  copyVersionId?: string | null;
  anchor?: Anchor | null;
};

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
      // The session already on this device, not a round trip to ask.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error("Not signed in");

      // agency_id is derived server-side from creative_id; visibility for a
      // client-side author is force-corrected to 'public' there too — this
      // is what the author sees requested, not what's guaranteed to land.
      const { data, error } = await supabase
        .from("comments")
        .insert({
          creative_id: creativeId,
          parent_id: parentId,
          author_id: user.id,
          body,
          visibility,
          creative_version_id: creativeVersionId,
          copy_version_id: copyVersionId,
          anchor,
        })
        .select("id")
        .single();

      if (error) throw error;
      classifyComment(data.id);
      // A client's own people comment here too (phase80).
      notifyClientActivity(creativeId);
    },
    // Shown at once (direct instruction: no wait for the comment to appear
    // where it was made), in place until the saved one replaces it; taken
    // back out if the save fails.
    onMutate: async (input: NewComment) => {
      const key = ["comments", creativeId];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CommentRow[]>(key);
      const user = queryClient.getQueryData<{ id: string; email?: string }>(["current-user"]);
      const profile = queryClient
        .getQueriesData<{ name: string | null; avatar_asset_id: string | null }>({ queryKey: ["my-profile"] })
        .map(([, d]) => d)
        .find(Boolean);
      const membership = queryClient
        .getQueriesData<MyMembership | null>({ queryKey: ["my-membership"] })
        .map(([, d]) => d)
        .find(Boolean);
      const isClient = !!membership?.client_id;
      const shown: CommentRow = {
        id: `pending-${Date.now()}`,
        parent_id: input.parentId,
        author_id: user?.id ?? null,
        guest_name: null,
        body: input.body,
        // A client's comment is always public (the database makes it so).
        visibility: isClient ? "public" : input.visibility,
        anchor: input.anchor ?? null,
        creative_version_id: input.creativeVersionId ?? null,
        copy_version_id: input.copyVersionId ?? null,
        resolved_at: null,
        created_at: new Date().toISOString(),
        edited_at: null,
        author: { name: profile?.name ?? user?.email ?? "You", avatar_asset_id: profile?.avatar_asset_id ?? null },
        from: isClient ? "client" : "agency",
      };
      queryClient.setQueryData<CommentRow[]>(key, [...(previous ?? []), shown]);
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(["comments", creativeId], context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["comments", creativeId] });
    },
  });
}
