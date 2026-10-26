"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// A project's statuses within In Production and Internal Review (phase123):
// the team reads them, Owners and Admins change them in the project's
// Settings. A post's status is kept in step with its stage by the
// database; only picking one is done here.
export interface ProjectStatus {
  id: string;
  stage: 2 | 3;
  label: string;
  position: number;
}

const key = (projectId: string | undefined) => ["project-statuses", projectId];

export function useProjectStatuses(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: key(projectId),
    queryFn: async (): Promise<ProjectStatus[]> => {
      const { data, error } = await createClient()
        .from("project_statuses")
        .select("id, stage, label, position")
        .eq("project_id", projectId!)
        .order("stage")
        .order("position")
        .order("created_at");
      if (error) throw error;
      return data as ProjectStatus[];
    },
    enabled: !!projectId && enabled,
  });
}

const DENIED = "Only Owners and Admins can change a project's statuses.";

function useStatusMutation<T>(projectId: string, run: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: T) => {
      // A write RLS blocks changes nothing and reports no error, so every
      // write asks its rows back and treats none as refused.
      const rows = await run(input);
      if (!rows || (Array.isArray(rows) && !rows.length)) throw new Error(DENIED);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: key(projectId), refetchType: "all" });
      // Renaming or deleting one changes what posts show.
      await queryClient.invalidateQueries({ queryKey: ["creatives"], refetchType: "all" });
      await queryClient.invalidateQueries({ queryKey: ["creative"] });
    },
  });
}

export function useAddProjectStatus(projectId: string) {
  return useStatusMutation(projectId, async (input: { stage: 2 | 3; label: string; position: number }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("project_statuses")
      .insert({ project_id: projectId, created_by: user?.id ?? null, ...input })
      .select("id");
    if (error) throw error;
    return data;
  });
}

export function useRenameProjectStatus(projectId: string) {
  return useStatusMutation(projectId, async (input: { id: string; label: string }) => {
    const { data, error } = await createClient().from("project_statuses").update({ label: input.label }).eq("id", input.id).select("id");
    if (error) throw error;
    return data;
  });
}

// Two statuses swap places.
export function useSwapProjectStatuses(projectId: string) {
  return useStatusMutation(projectId, async (input: { a: ProjectStatus; b: ProjectStatus }) => {
    const supabase = createClient();
    // Their places as they are in the list, so equal positions still swap.
    const [pa, pb] = input.a.position === input.b.position ? [0, 1] : [input.a.position, input.b.position];
    const first = await supabase.from("project_statuses").update({ position: pb }).eq("id", input.a.id).select("id");
    if (first.error) throw first.error;
    const second = await supabase.from("project_statuses").update({ position: pa }).eq("id", input.b.id).select("id");
    if (second.error) throw second.error;
    return [...(first.data ?? []), ...(second.data ?? [])].length === 2 ? second.data : [];
  });
}

export function useDeleteProjectStatus(projectId: string) {
  return useStatusMutation(projectId, async (id: string) => {
    const { data, error } = await createClient().from("project_statuses").delete().eq("id", id).select("id");
    if (error) throw error;
    return data;
  });
}

// How many posts are on a status, for the warning before it's deleted.
export function useStatusPostCount(statusId: string | null) {
  return useQuery({
    queryKey: ["status-post-count", statusId],
    queryFn: async () => {
      const { count, error } = await createClient()
        .from("creatives")
        .select("id", { count: "exact", head: true })
        .eq("status_id", statusId!);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!statusId,
  });
}

// A post's status, picked by the team.
export function useSetCreativeStatus(creativeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (statusId: string) => {
      const { data, error } = await createClient().from("creatives").update({ status_id: statusId }).eq("id", creativeId).select("status_id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("You can't change this post's status.");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["creative", creativeId], refetchType: "all" });
      await queryClient.invalidateQueries({ queryKey: ["creatives"], refetchType: "all" });
    },
  });
}
