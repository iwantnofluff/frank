"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Who can be on a project's posts' Team (direct instruction): the people
// its People panel lists from the team side, every Owner and Admin and the
// Users added to it, never a client's people. User ids, from the database
// (phase107), since a User can't read who else is on a project.
export function useProjectTeam(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project-team", projectId],
    queryFn: async (): Promise<string[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("project_team_user_ids", { p_project_id: projectId });
      if (error) throw error;
      return (data ?? []) as string[];
    },
    enabled: !!projectId,
  });
}
