"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { inMonth, type MonthReview } from "@/lib/month-review";
import { goLiveDay } from "@/lib/post-live";

// Check the Month (phase173): the last review of a project's month, and
// writing a new one (app/api/ai/month-review). The team's only (RLS).
export interface MonthReviewRow {
  id: string;
  project_id: string;
  month: string; // YYYY-MM-01
  review: MonthReview;
  posts_at: string | null;
  post_count: number;
  created_by: string | null;
  updated_at: string;
}

const COLUMNS = "id, project_id, month, review, posts_at, post_count, created_by, updated_at";

export function useMonthReview(projectId: string | null | undefined, month: string | null) {
  return useQuery({
    queryKey: ["month-review", projectId, month],
    enabled: !!projectId && !!month,
    // As it is now each time the window opens: a teammate may have run it.
    refetchOnMount: "always",
    queryFn: async (): Promise<MonthReviewRow | null> => {
      const { data, error } = await createClient()
        .from("month_reviews")
        .select(COLUMNS)
        .eq("project_id", projectId!)
        .eq("month", month!)
        .maybeSingle();
      if (error) throw error;
      return (data as MonthReviewRow | null) ?? null;
    },
  });
}

export function useRunMonthReview(projectId: string | null | undefined, month: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<MonthReviewRow> => {
      const res = await fetch("/api/ai/month-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, month }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't check the month");
      return data as MonthReviewRow;
    },
    onSuccess: (row) => {
      queryClient.setQueryData(["month-review", projectId, month], row);
      void queryClient.invalidateQueries({ queryKey: ["month-posts-stamp", projectId, month] });
    },
  });
}

// The month's posts as they are now (how many, and the newest change among
// them), by the same rules the review is written from, so the window can
// say when they've changed since it was.
export function useMonthPostsStamp(projectId: string | null | undefined, month: string | null) {
  return useQuery({
    queryKey: ["month-posts-stamp", projectId, month],
    enabled: !!projectId && !!month,
    refetchOnMount: "always",
    queryFn: async (): Promise<{ count: number; at: string | null }> => {
      const supabase = createClient();
      const [posts, hidden] = await Promise.all([
        supabase
          .from("creatives")
          .select("scheduled_at, due_on, publish_on, status_id, updated_at")
          .eq("project_id", projectId!)
          .is("archived_at", null),
        supabase.from("stage_statuses").select("id").eq("hides_post", true),
      ]);
      if (posts.error) throw posts.error;
      const hiddenIds = new Set((hidden.data ?? []).map((s) => s.id as string));
      const inIt = (posts.data ?? []).filter((c) => {
        const day = c.scheduled_at?.slice(0, 10) ?? goLiveDay(c);
        return inMonth(day, month!) && !(c.status_id && hiddenIds.has(c.status_id));
      });
      const at = inIt.reduce<string | null>((m, c) => (c.updated_at && (!m || c.updated_at > m) ? c.updated_at : m), null);
      return { count: inIt.length, at };
    },
  });
}
