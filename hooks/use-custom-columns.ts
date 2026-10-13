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
  | "long_text"
  | "dropdown"
  | "status"
  | "checkbox"
  | "number"
  | "date";

// What a new column can record, as offered when adding one (phase96,
// decided directly); "status" stays readable for any column already using it.
export const COLUMN_TYPE_OPTIONS: { value: CustomColumnType; label: string }[] = [
  { value: "text", label: "Single Line Text" },
  { value: "long_text", label: "Large Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "dropdown", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
];

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
