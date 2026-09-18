"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

interface ActionResult {
  status: string;
  invalid?: boolean;
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
      }
    },
  });
}
