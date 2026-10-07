"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { classifyComment } from "@/lib/ai/classify-comment-client";
import type { SharedReviewResult as SharedReviewData } from "./use-shared-review";

interface ActionResult {
  status: string;
  invalid?: boolean;
  // Present on a successful comment insert (submit_shared_comment/
  // submit_shared_approval/submit_shared_request_changes all return it) —
  // triggers a fire-and-forget classification, never awaited.
  comment_id?: string;
}

export function useSubmitSharedComment(token: string, passcode: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      creativeId: string;
      body: string;
      guestName: string;
      guestEmail: string;
      // A moment in the video, in seconds (phase34).
      atSeconds?: number | null;
      // Which carousel slide, when the video is one of several (phase35).
      slide?: number | null;
    }): Promise<ActionResult> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("submit_shared_comment", {
        p_token: token,
        p_passcode: passcode,
        p_creative_id: input.creativeId,
        p_body: input.body,
        p_guest_name: input.guestName,
        p_guest_email: input.guestEmail,
        // Only sent when there is one, so a comment without a moment is the
        // same call as before.
        ...(input.atSeconds != null ? { p_at_seconds: Math.round(input.atSeconds * 100) / 100 } : {}),
        ...(input.atSeconds != null && input.slide != null ? { p_slide: input.slide } : {}),
      });
      if (error) throw error;
      return data as ActionResult;
    },
    // Shown at once, under the guest's name (direct instruction), until the
    // reload brings the saved one; taken back out if it isn't saved.
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ["shared-review", token] });
      const previous = queryClient.getQueriesData<SharedReviewData>({ queryKey: ["shared-review", token] });
      queryClient.setQueriesData<SharedReviewData>({ queryKey: ["shared-review", token] }, (data) => {
        if (!data || data.status !== "ok") return data;
        return {
          ...data,
          creatives: data.creatives.map((c) =>
            c.id !== input.creativeId
              ? c
              : {
                  ...c,
                  comments: [
                    ...c.comments,
                    {
                      id: `pending-${Date.now()}`,
                      author_name: input.guestName,
                      body: input.body,
                      created_at: new Date().toISOString(),
                      anchor:
                        input.atSeconds != null
                          ? { type: "time", t: input.atSeconds, ...(input.slide != null ? { slide: input.slide } : {}) }
                          : null,
                    },
                  ],
                },
          ),
        };
      });
      return { previous };
    },
    onError: (_error, _input, context) => {
      for (const [key, data] of context?.previous ?? []) queryClient.setQueryData(key, data);
    },
    onSuccess: (result, _input, context) => {
      if (result.status === "ok") {
        if (result.comment_id) classifyComment(result.comment_id);
      } else {
        for (const [key, data] of context?.previous ?? []) queryClient.setQueryData(key, data);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["shared-review", token] });
    },
  });
}

export function useSubmitSharedApproval(token: string, passcode: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      creativeId: string;
      guestName: string;
      guestEmail: string;
    }): Promise<ActionResult> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("submit_shared_approval", {
        p_token: token,
        p_passcode: passcode,
        p_creative_id: input.creativeId,
        p_guest_name: input.guestName,
        p_guest_email: input.guestEmail,
      });
      if (error) throw error;
      return data as ActionResult;
    },
    // Approved on screen the moment it's clicked (direct instruction): the
    // cached post is marked approved before the call, so the button can't
    // read "Approve" again while the page catches up, and is put back if
    // the approval doesn't go through. The database also counts it once
    // (phase53).
    onMutate: async (input) => {
      const key = ["shared-review", token, passcode];
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<SharedReviewData>(key);
      queryClient.setQueryData<SharedReviewData>(key, (old) =>
        old && old.status === "ok"
          ? {
              ...old,
              creatives: old.creatives.map((c) =>
                c.id === input.creativeId ? { ...c, approved_at: new Date().toISOString(), exception: null } : c,
              ),
            }
          : old,
      );
      return { before };
    },
    onError: (_error, _input, context) => {
      if (context?.before) queryClient.setQueryData(["shared-review", token, passcode], context.before);
    },
    onSuccess: (result, _input, context) => {
      if (result.status === "ok") {
        queryClient.invalidateQueries({ queryKey: ["shared-review", token] });
        if (result.comment_id) classifyComment(result.comment_id);
      } else if (context?.before) {
        queryClient.setQueryData(["shared-review", token, passcode], context.before);
      }
    },
  });
}

// The alternative to approval — posts the guest's own feedback as a comment
// and sets the creative's real exception status to 'changes_requested', so
// it shows up that way throughout the internal app too, not just in this
// thread (see the migration's own comment).
export function useSubmitSharedRequestChanges(token: string, passcode: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      creativeId: string;
      body: string;
      guestName: string;
      guestEmail: string;
    }): Promise<ActionResult> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("submit_shared_request_changes", {
        p_token: token,
        p_passcode: passcode,
        p_creative_id: input.creativeId,
        p_body: input.body,
        p_guest_name: input.guestName,
        p_guest_email: input.guestEmail,
      });
      if (error) throw error;
      return data as ActionResult;
    },
    onSuccess: (result) => {
      if (result.status === "ok") {
        queryClient.invalidateQueries({ queryKey: ["shared-review", token] });
        if (result.comment_id) classifyComment(result.comment_id);
      }
    },
  });
}
