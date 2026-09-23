"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";

export interface CreateProjectInput {
  clientId: string;
  name: string;
  type: string;
  delivery: "scheduled" | "continuous";
}

// projects_set_agency_id (phase0_baseline.sql) derives agency_id from
// client_id on insert — never set here, same verified-empirically shape as
// use-create-creative.ts. projects_insert is staff-only, matching this
// modal's isStaff gate.
export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateProjectInput) => {
      const supabase = createSupabaseClient();
      const { data, error } = await supabase
        .from("projects")
        .insert({
          client_id: input.clientId,
          name: input.name,
          type: input.type || null,
          delivery: input.delivery,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["projects", variables.clientId] });
      await queryClient.invalidateQueries({
        queryKey: ["project-creative-stats", variables.clientId],
      });
    },
  });
}
