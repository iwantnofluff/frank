"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { StrategyFields } from "@/lib/monthly-strategy";

// A client's monthly strategies (phase78): every month written so far,
// newest first. RLS: anyone who can see the client reads; the team writes.
export interface MonthlyStrategyRow extends StrategyFields {
  id: string;
  month: string; // YYYY-MM-01
  updated_at: string;
  // Archived (phase79): out of the Active list, still followed when drafting.
  archived_at: string | null;
}

const COLUMNS = "id, month, objective, key_messages, themes, offers, key_dates, notes, updated_at, archived_at";

export function useMonthlyStrategies(clientId: string) {
  return useQuery({
    queryKey: ["monthly-strategies", clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<MonthlyStrategyRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("client_monthly_strategies")
        .select(COLUMNS)
        .eq("client_id", clientId)
        .order("month", { ascending: false });
      if (error) throw error;
      return data as MonthlyStrategyRow[];
    },
  });
}

// Saves one month: written over whatever was there for it. The row is
// asked back, so a refused write says so rather than looking saved.
export function useSaveMonthlyStrategy(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ month, fields }: { month: string; fields: StrategyFields }) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const clean = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v?.trim() ? v.trim() : null]));
      const { data, error } = await supabase
        .from("client_monthly_strategies")
        .upsert(
          { client_id: clientId, month, ...clean, updated_by: user?.id ?? null, updated_at: new Date().toISOString() },
          { onConflict: "client_id,month" },
        )
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Only the team can change the strategy.");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["monthly-strategies", clientId] }),
  });
}

// Add Month (phase79): an empty month to fill in.
export function useAddStrategyMonth(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (month: string) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("client_monthly_strategies")
        .insert({ client_id: clientId, month })
        .select("id");
      if (error?.code === "23505") throw new Error("That month is already there.");
      if (error) throw error;
      if (!data?.length) throw new Error("Only the team can add a month.");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["monthly-strategies", clientId] }),
  });
}

// Archive or bring back a month (phase79).
export function useArchiveStrategyMonth(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, archive }: { id: string; archive: boolean }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("client_monthly_strategies")
        .update({ archived_at: archive ? new Date().toISOString() : null })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Only the team can archive a month.");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["monthly-strategies", clientId] }),
  });
}
