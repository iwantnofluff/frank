"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { ProofreadRuleRow } from "@/lib/proofread-rules";

// The workspace's proofreading rules (phase122): a row per built-in that's
// been changed, and the workspace's own instructions and preferred words.
// Owners and Admins change them; the team reads them.
export function useProofreadRules(agencyId: string | undefined) {
  return useQuery({
    queryKey: ["proofread-rules", agencyId],
    queryFn: async (): Promise<ProofreadRuleRow[]> => {
      const supabase = createClient();
      // A person in several workspaces reads only this one's.
      const { data, error } = await supabase
        .from("proofread_rules")
        .select("id, kind, rule_key, body, from_word, to_word, enabled, options, created_at")
        .eq("agency_id", agencyId!)
        .order("created_at");
      if (error) throw error;
      return data as ProofreadRuleRow[];
    },
    enabled: !!agencyId,
  });
}

const DENIED = "Only Owners and Admins can change the proofreading rules.";

function useRuleMutation<T>(agencyId: string | undefined, run: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: T) => {
      // A write RLS blocks changes nothing and reports no error, so every
      // write asks its row back and treats none as refused.
      const row = await run(input);
      if (!row) throw new Error(DENIED);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["proofread-rules", agencyId] }),
  });
}

// A built-in switched on or off, or its settings changed.
export function useSetBuiltinRule(agencyId: string | undefined) {
  return useRuleMutation(agencyId, async (input: { key: string; enabled: boolean; options?: Record<string, unknown> }) => {
    const { data, error } = await createClient()
      .from("proofread_rules")
      .upsert(
        { agency_id: agencyId, kind: "builtin", rule_key: input.key, enabled: input.enabled, options: input.options ?? {}, updated_at: new Date().toISOString() },
        { onConflict: "agency_id,rule_key" },
      )
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return data;
  });
}

export function useAddProofreadRule(agencyId: string | undefined) {
  return useRuleMutation(
    agencyId,
    async (input: { kind: "instruction"; body: string } | { kind: "word"; from_word: string; to_word: string }) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("proofread_rules")
        .insert({ agency_id: agencyId, created_by: user?.id ?? null, ...input })
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  );
}

export function useUpdateProofreadRule(agencyId: string | undefined) {
  return useRuleMutation(
    agencyId,
    async (input: { id: string; enabled?: boolean; body?: string; from_word?: string; to_word?: string }) => {
      const { id, ...patch } = input;
      const { data, error } = await createClient()
        .from("proofread_rules")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  );
}

export function useDeleteProofreadRule(agencyId: string | undefined) {
  return useRuleMutation(agencyId, async (id: string) => {
    const { data, error } = await createClient().from("proofread_rules").delete().eq("id", id).select("id").maybeSingle();
    if (error) throw error;
    return data;
  });
}
