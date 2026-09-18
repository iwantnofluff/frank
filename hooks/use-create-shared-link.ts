"use client";

import { useMutation } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type SharedLinkScope = "pending" | "all" | "one" | "pick";

export interface CreateSharedLinkInput {
  projectId: string;
  scope: SharedLinkScope;
  creativeId?: string | null;
  pickedCreatives?: string[] | null;
  expiresInDays: number; // 0 = never
  passcode?: string | null;
  canApprove: boolean;
}

export function useCreateSharedLink() {
  return useMutation({
    mutationFn: async (input: CreateSharedLinkInput) => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("create_shared_link", {
        p_project_id: input.projectId,
        p_scope: input.scope,
        p_creative_id: input.creativeId ?? null,
        p_picked_creatives: input.pickedCreatives ?? null,
        p_expires_in_days: input.expiresInDays,
        p_passcode: input.passcode || null,
        p_can_approve: input.canApprove,
      });

      if (error) throw error;
      const token = data?.[0]?.token as string | undefined;
      if (!token) throw new Error("No token returned");
      return token;
    },
  });
}
