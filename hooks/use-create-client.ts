"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";

export interface CreateClientInput {
  agencyId: string;
  name: string;
  industry: string;
}

// clients_insert (phase0_baseline.sql) requires is_agency_staff(agency_id)
// and, unlike creatives/projects, there's no parent row to derive agency_id
// from via trigger — clients is the top of the tenant hierarchy, so the
// caller's own agencyId is passed straight through. The
// (agency_id, lower(name)) unique index (active rows only) surfaces as a
// plain insert error on a duplicate name — not handled specially here.
export function useCreateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateClientInput) => {
      const supabase = createSupabaseClient();
      const { data, error } = await supabase
        .from("clients")
        .insert({
          agency_id: input.agencyId,
          name: input.name,
          industry: input.industry || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}
