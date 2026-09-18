"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface CreativeListRow {
  id: string;
  name: string;
  format: string;
  stage: number;
  exception: "changes_requested" | "rejected" | null;
  scheduled_at: string | null;
  platforms: string[] | null;
  destination: string | null;
  added_on: string;
  due_on: string | null;
  cx: Record<string, string | number | boolean | null>;
}

export function useCreatives(projectId: string) {
  return useQuery({
    queryKey: ["creatives", projectId],
    queryFn: async (): Promise<CreativeListRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("creatives")
        .select(
          "id, name, format, stage, exception, scheduled_at, platforms, destination, added_on, due_on, cx",
        )
        .eq("project_id", projectId)
        .is("archived_at", null)
        .order("position");

      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });
}
