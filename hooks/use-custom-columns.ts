"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface CustomColumnOption {
  value: string;
  label: string;
  colour?: string;
}

export type CustomColumnType =
  | "text"
  | "dropdown"
  | "status"
  | "checkbox"
  | "number";

export interface CustomColumnRow {
  id: string;
  key: string;
  label: string;
  type: CustomColumnType;
  options: CustomColumnOption[] | null;
  position: number;
}

export function useCustomColumns(projectId: string) {
  return useQuery({
    queryKey: ["custom-columns", projectId],
    queryFn: async (): Promise<CustomColumnRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("custom_columns")
        .select("id, key, label, type, options, position")
        .eq("project_id", projectId)
        .is("archived_at", null)
        .order("position");

      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });
}
