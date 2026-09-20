"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface CreativeListRow {
  id: string;
  name: string;
  format: string;
  stage: number;
  exception: "changes_requested" | "rejected" | null;
  lead_user_id: string | null;
  scheduled_at: string | null;
  platforms: string[] | null;
  destination: string | null;
  added_on: string;
  due_on: string | null;
  cx: Record<string, string | number | boolean | null>;
  lead: { name: string } | null;
}

export function useCreatives(projectId: string) {
  return useQuery({
    queryKey: ["creatives", projectId],
    queryFn: async (): Promise<CreativeListRow[]> => {
      const supabase = createClient();

      // Plain select plus a second query for lead names, merged client-side
      // — same reasoning as hooks/use-comments.ts's author resolution:
      // lead_user_id is nullable, and this avoids depending on an embedded
      // join's row-dropping behaviour for that case.
      const { data: rows, error } = await supabase
        .from("creatives")
        .select(
          "id, name, format, stage, exception, lead_user_id, scheduled_at, platforms, destination, added_on, due_on, cx",
        )
        .eq("project_id", projectId)
        .is("archived_at", null)
        .order("position");

      if (error) throw error;

      const leadIds = [...new Set(rows.map((r) => r.lead_user_id).filter((id): id is string => !!id))];
      let namesById = new Map<string, string>();
      if (leadIds.length > 0) {
        const { data: users, error: usersError } = await supabase
          .from("users")
          .select("id, name")
          .in("id", leadIds);
        if (usersError) throw usersError;
        namesById = new Map(users.map((u) => [u.id, u.name]));
      }

      return rows.map((r) => ({
        ...r,
        lead: r.lead_user_id ? { name: namesById.get(r.lead_user_id) ?? "" } : null,
      })) as unknown as CreativeListRow[];
    },
    enabled: !!projectId,
  });
}
