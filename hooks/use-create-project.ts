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
      // The id is chosen here and the row read back after (phase46): a User
      // sees a project only once they're on it, which the database arranges
      // as the insert finishes — too late for the insert to return it.
      const id = crypto.randomUUID();
      const { error } = await supabase.from("projects").insert({
        id,
        client_id: input.clientId,
        name: input.name,
        type: input.type || null,
        delivery: input.delivery,
      });
      if (error) throw error;
      const { data, error: readError } = await supabase.from("projects").select().eq("id", id).single();
      if (readError) throw readError;
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
