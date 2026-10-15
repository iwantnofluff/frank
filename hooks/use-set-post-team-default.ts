"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { ProjectRow } from "./use-project";

// Ticking someone onto, or off, a project's new posts by default
// (phase101). Owners and Admins; the database refuses anyone else, and so
// does this, if nothing changed.
export function useSetPostTeamDefault(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ current, userId, on }: { current: string[]; userId: string; on: boolean }) => {
      const next = on ? [...new Set([...current, userId])] : current.filter((id) => id !== userId);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("projects")
        .update({ default_team_user_ids: next })
        .eq("id", projectId)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Only Owners and Admins can choose who's on new posts.");
    },
    // Ticked at once, and back if the save fails.
    onMutate: async ({ current, userId, on }) => {
      const key = ["project", projectId];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ProjectRow>(key);
      const next = on ? [...new Set([...current, userId])] : current.filter((id) => id !== userId);
      if (previous) queryClient.setQueryData<ProjectRow>(key, { ...previous, default_team_user_ids: next });
      return { previous };
    },
    onError: (_e, _v, context) => {
      if (context?.previous) queryClient.setQueryData(["project", projectId], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
  });
}
