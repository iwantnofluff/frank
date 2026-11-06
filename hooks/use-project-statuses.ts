"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { signedInUser } from "@/lib/supabase/signed-in-user";

// A project's statuses within In Production and Internal Review (phase123):
// the team reads them, Owners and Admins change them in the project's
// Settings. A post's status is kept in step with its stage by the
// database; only picking one is done here.
export interface ProjectStatus {
  id: string;
  stage: 2 | 3;
  label: string;
  position: number;
  // Its posts are hidden from the lists and counts (phase143): Cancel, by
  // default.
  hides_post: boolean;
}

const key = (projectId: string | undefined) => ["project-statuses", projectId];

export function useProjectStatuses(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: key(projectId),
    queryFn: async (): Promise<ProjectStatus[]> => {
      const { data, error } = await createClient()
        .from("project_statuses")
        .select("id, stage, label, position, hides_post")
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
      // Renaming, hiding or deleting one changes what posts show.
      await queryClient.invalidateQueries({ queryKey: ["hidden-statuses"], refetchType: "all" });
      await queryClient.invalidateQueries({ queryKey: ["project-creative-stats"] });
      await queryClient.invalidateQueries({ queryKey: ["agency-creative-stats"] });
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
    } = await signedInUser(supabase);
    const { data, error } = await supabase
      .from("project_statuses")
      .insert({ project_id: projectId, created_by: user?.id ?? null, ...input })
      .select("id");
    if (error) throw error;
    return data;
  });
}

// Whether a status's posts are hidden (phase143).
export function useSetStatusHides(projectId: string) {
  return useStatusMutation(projectId, async (input: { id: string; hides: boolean }) => {
    const { data, error } = await createClient().from("project_statuses").update({ hides_post: input.hides }).eq("id", input.id).select("id");
    if (error) throw error;
    return data;
  });
}

// Every status the person can read that hides its posts (phase143), across
// projects: the lists, the feed grid and the counts leave those posts out.
// The team's only: a client reads no statuses, and never sees a post in the
// stages that have them.
export function useHiddenStatusIds() {
  return useQuery({
    queryKey: ["hidden-statuses"],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await createClient().from("project_statuses").select("id").eq("hides_post", true);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.id as string));
    },
    staleTime: 60_000,
  });
}

// Whether a post is hidden by its status.
export const isHiddenPost = (post: { status_id?: string | null }, hidden: Set<string> | undefined) =>
  !!post.status_id && !!hidden?.has(post.status_id);

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

// A post's status, picked by the team: on the post, or from the table.
export function useSetCreativeStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    // null: the stage alone (phase124).
    mutationFn: async ({ creativeId, statusId }: { creativeId: string; statusId: string | null }) => {
      const { data, error } = await createClient().from("creatives").update({ status_id: statusId }).eq("id", creativeId).select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("You can't change this post's status.");
    },
    onSuccess: async (_d, { creativeId }) => {
      await queryClient.invalidateQueries({ queryKey: ["creative", creativeId], refetchType: "all" });
      await queryClient.invalidateQueries({ queryKey: ["creatives"], refetchType: "all" });
    },
  });
}

// A post to any stage, and status, from the table (phase125): null for
// the stage alone. The database applies the stage's rules (approval,
// live date) and refuses a post still in Concept until it's approved.
export function useSetCreativeStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ creativeId, stage, statusId }: { creativeId: string; stage: number; statusId: string | null }) => {
      const { error } = await createClient().rpc("set_creative_stage", { p_creative_id: creativeId, p_stage: stage, p_status_id: statusId });
      if (error) throw error;
    },
    onSuccess: async (_d, { creativeId }) => {
      await queryClient.invalidateQueries({ queryKey: ["creative", creativeId], refetchType: "all" });
      await queryClient.invalidateQueries({ queryKey: ["creatives"], refetchType: "all" });
      await queryClient.invalidateQueries({ queryKey: ["post-live-date", creativeId] });
    },
  });
}
