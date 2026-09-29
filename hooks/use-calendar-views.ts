"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type CalendarViewTableType = "scheduled" | "continuous";

export interface CalendarViewRow {
  id: string;
  name: string;
  column_order: string[];
  hidden_columns: string[];
  column_widths: Record<string, number>;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// Agency-wide, not project-scoped — same reach as format_directions
// (supabase/migrations/phase10_calendar_views.sql). A view saved from one
// project's calendar is available from every other project's calendar too,
// which is the actual product ask ("saved globally... for other clients").
// Scoped by table_type (phase14_calendar_views_table_type.sql) since the
// Scheduled and Continuous tables have entirely different column sets — a
// view saved on one would otherwise show up as a nonsensical tab on the
// other.
export function useCalendarViews(tableType: CalendarViewTableType) {
  return useQuery({
    queryKey: ["calendar-views", tableType],
    queryFn: async (): Promise<CalendarViewRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("calendar_views")
        .select("id, name, column_order, hidden_columns, column_widths, created_by, created_at, updated_at")
        .eq("table_type", tableType)
        .order("name");
      if (error) throw error;
      return data as unknown as CalendarViewRow[];
    },
  });
}

export interface CalendarViewInput {
  name: string;
  columnOrder: string[];
  hiddenColumns: string[];
  columnWidths: Record<string, number>;
}

// calendar_views has no parent row to derive agency_id from via trigger
// (it's agency-internal reference data, same shape as clients/agencies
// themselves) — the caller's own agencyId is passed straight through,
// same pattern as use-create-client.ts.
export function useCreateCalendarView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      agencyId,
      tableType,
      ...input
    }: CalendarViewInput & { agencyId: string; tableType: CalendarViewTableType }) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const { data, error } = await supabase
        .from("calendar_views")
        .insert({
          agency_id: agencyId,
          table_type: tableType,
          name: input.name,
          column_order: input.columnOrder,
          hidden_columns: input.hiddenColumns,
          column_widths: input.columnWidths,
          created_by: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as CalendarViewRow;
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["calendar-views", variables.tableType] });
    },
  });
}

export function useUpdateCalendarView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: CalendarViewInput & { id: string }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("calendar_views")
        .update({
          name: input.name,
          column_order: input.columnOrder,
          hidden_columns: input.hiddenColumns,
          column_widths: input.columnWidths,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as CalendarViewRow;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["calendar-views"] });
    },
  });
}

export function useDeleteCalendarView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("calendar_views").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["calendar-views"] });
    },
  });
}
