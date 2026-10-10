"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Each person's role on a project (phase85): "Designer", "Lead"… by user id.
// Shown in brackets after their name in the project's Team column.
export function useProjectRoles(projectId: string) {
  return useQuery({
    queryKey: ["project-roles", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<Record<string, string>> => {
      const supabase = createClient();
      const { data, error } = await supabase.from("project_roles").select("user_id, role").eq("project_id", projectId);
      if (error) throw error;
      return Object.fromEntries(data.map((r) => [r.user_id as string, r.role as string]));
    },
  });
}

// Sets someone's role; blank clears it. Checks the write landed: a blocked
// one reports nothing rather than failing on its own.
export function useSetProjectRole(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const supabase = createClient();
      const value = role.trim();
      if (!value) {
        const { error } = await supabase.from("project_roles").delete().eq("project_id", projectId).eq("user_id", userId);
        if (error) throw error;
        return;
      }
      const { data, error } = await supabase
        .from("project_roles")
        .upsert({ project_id: projectId, user_id: userId, role: value, updated_at: new Date().toISOString() })
        .select("user_id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Only Owners and Admins can set roles.");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project-roles", projectId] }),
  });
}
