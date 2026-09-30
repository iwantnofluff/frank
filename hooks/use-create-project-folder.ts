"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// project_folders_set_agency_id derives agency_id from client_id on
// insert — never set here, same shape as use-create-project.ts.
// project_folders_insert is staff-only.
export function useCreateProjectFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ clientId, name }: { clientId: string; name: string }) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const { data, error } = await supabase
        .from("project_folders")
        .insert({ client_id: clientId, name: name.trim(), created_by: user.id })
        .select("id")
        .single();

      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (_data, { clientId }) => {
      queryClient.invalidateQueries({ queryKey: ["project-folders", clientId] });
    },
  });
}
