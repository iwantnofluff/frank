"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface MyTips {
  everyHours: number;
  seen: string[];
  lastAt: string | null;
}

// This person's tips (phase116): how often, which they've seen, and when the
// last one showed. Kept on them, so it follows them across devices.
export function useMyTips(enabled: boolean) {
  return useQuery({
    queryKey: ["my-tips"],
    enabled,
    queryFn: async (): Promise<MyTips | null> => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from("users")
        .select("tips_every_hours, tips_seen, tips_last_at")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return {
        everyHours: (data.tips_every_hours as number | null) ?? 24,
        seen: (data.tips_seen as string[] | null) ?? [],
        lastAt: (data.tips_last_at as string | null) ?? null,
      };
    },
  });
}

async function updateMine(fields: Record<string, unknown>) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { data, error } = await supabase.from("users").update(fields).eq("id", user.id).select("id");
  if (error) throw error;
  // A blocked update reports no error, only no rows.
  if (!data?.length) throw new Error("Couldn't save your tips setting");
}

// A tip has been shown: it's seen, and the next waits from now.
export function useMarkTipShown() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, seen }: { id: string; seen: string[] }) => {
      await updateMine({ tips_seen: [...new Set([...seen, id])], tips_last_at: new Date().toISOString() });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["my-tips"] }),
  });
}

// How often, from their Notifications settings.
export function useSetTipsEvery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (hours: number) => updateMine({ tips_every_hours: hours }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-tips"] }),
  });
}

// Where See it in Action goes when you're not in a project: your most
// recently changed post with a format (its Content tab has Draft with
// Frank), and its project; else your newest project.
export function useTipTargets(enabled: boolean) {
  return useQuery({
    queryKey: ["tip-targets"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ postId: string | null; projectId: string | null }> => {
      const supabase = createClient();
      const { data: post, error } = await supabase
        .from("creatives")
        .select("id, project_id")
        .is("archived_at", null)
        .not("format", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (post) return { postId: post.id as string, projectId: post.project_id as string };
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id")
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (projectError) throw projectError;
      return { postId: null, projectId: (project?.id as string | undefined) ?? null };
    },
  });
}
