"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { classifyComment } from "@/lib/ai/classify-comment-client";

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
    }): Promise<ActionResult> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("submit_shared_comment", {
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
    onSuccess: (result) => {
      if (result.status === "ok") {
        queryClient.invalidateQueries({ queryKey: ["shared-review", token] });
        if (result.comment_id) classifyComment(result.comment_id);
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
