"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { signedInUser } from "@/lib/supabase/signed-in-user";
import type { CheckFinding } from "@/lib/ai/build-check-prompt";

// A post's saved Check Brand (phase174, direct instruction): its findings,
// and the copy version saved when it ran, so it can say when the copy has
// changed since. The team's only (RLS).
export interface BrandCheckRow {
  creative_id: string;
  findings: CheckFinding[];
  copy_version_no: number | null;
  created_by: string | null;
  updated_at: string;
}

const COLUMNS = "creative_id, findings, copy_version_no, created_by, updated_at";

export function useBrandCheck(creativeId: string | null | undefined) {
  return useQuery({
    queryKey: ["brand-check", creativeId],
    enabled: !!creativeId,
    refetchOnMount: "always",
    queryFn: async (): Promise<BrandCheckRow | null> => {
      const { data, error } = await createClient().from("brand_checks").select(COLUMNS).eq("creative_id", creativeId!).maybeSingle();
      if (error) throw error;
      return (data as BrandCheckRow | null) ?? null;
    },
  });
}

// Keeps a run as the post's saved Check Brand, over the last one. A refused
// write says so rather than looking saved.
export function useSaveBrandCheck(creativeId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { findings: CheckFinding[]; copyVersionNo: number | null }): Promise<BrandCheckRow> => {
      const supabase = createClient();
      const { data: auth } = await signedInUser(supabase);
      const { data, error } = await supabase
        .from("brand_checks")
        .upsert(
          {
            creative_id: creativeId,
            findings: input.findings,
            copy_version_no: input.copyVersionNo,
            created_by: auth.user?.id ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "creative_id" },
        )
        .select(COLUMNS)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Couldn't save the check");
      return data as BrandCheckRow;
    },
    onSuccess: (row) => queryClient.setQueryData(["brand-check", creativeId], row),
  });
}

// Posts a saved check to the project's Slack channel (app/api/slack/share-check).
export function useShareCheckToSlack() {
  return useMutation({
    mutationFn: async (input: { creativeId: string; kind: "brand" | "month"; month?: string }) => {
      const res = await fetch("/api/slack/share-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't share it to Slack");
      return data as { channel: string | null };
    },
  });
}
