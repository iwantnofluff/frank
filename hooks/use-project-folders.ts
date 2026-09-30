"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface ProjectFolderRow {
  id: string;
  client_id: string;
  name: string;
  position: number;
}

export function useProjectFolders(clientId: string) {
  return useQuery({
    queryKey: ["project-folders", clientId],
    queryFn: async (): Promise<ProjectFolderRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("project_folders")
        .select("id, client_id, name, position")
        .eq("client_id", clientId)
        .order("position");

      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });
}
