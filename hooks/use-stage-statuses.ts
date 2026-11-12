"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { signedInUser } from "@/lib/supabase/signed-in-user";

// The statuses within each stage (phase151, was each project's, phase123):
// the agency's list, in Settings → Statuses, which every client uses, or a
// client's own, in its Client Settings. The team reads them, Owners and
// Admins change them. A post's status is kept in step with its stage by
// the database; only picking one is done here.
export interface StageStatus {
  id: string;
  stage: number;
  label: string;
  position: number;
  // Its posts are hidden from the lists and counts (phase143): Cancel, by
  // default. Concept, In Production and Internal Review only.
  hides_post: boolean;
}

// Which list: the agency's (no client) or a client's own.
export interface StatusList {
  agencyId: string;
  clientId: string | null;
}

const COLUMNS = "id, stage, label, position, hides_post";

export function useStatusList(list: StatusList | undefined, enabled = true) {
  return useQuery({
    queryKey: ["stage-statuses", "list", list?.clientId ?? null],
    queryFn: async (): Promise<StageStatus[]> => {
      const query = createClient().from("stage_statuses").select(COLUMNS);
      const { data, error } = await (list!.clientId ? query.eq("client_id", list!.clientId) : query.is("client_id", null))
        .order("stage")
        .order("position")
        .order("created_at");
      if (error) throw error;
      return data as StageStatus[];
    },
    enabled: !!list && enabled,
  });
}

// The list a project's posts use: its client's own, or the agency's.
export function useProjectStatuses(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["stage-statuses", "project", projectId],
    queryFn: async (): Promise<StageStatus[]> => {
      const supabase = createClient();
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("client_id, clients(own_statuses)")
        .eq("id", projectId!)
        .single();
      if (projectError) throw projectError;
      const own = (project.clients as unknown as { own_statuses: boolean } | null)?.own_statuses;
      const query = supabase.from("stage_statuses").select(COLUMNS);
      const { data, error } = await (own ? query.eq("client_id", project.client_id) : query.is("client_id", null))
        .order("stage")
        .order("position")
        .order("created_at");
      if (error) throw error;
      return data as StageStatus[];
    },
    enabled: !!projectId && enabled,
  });
}

// Whether a client uses its own list.
export function useClientOwnStatuses(clientId: string | undefined) {
  return useQuery({
    queryKey: ["stage-statuses", "own", clientId],
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await createClient().from("clients").select("own_statuses").eq("id", clientId!).single();
      if (error) throw error;
      return data.own_statuses as boolean;
    },
    enabled: !!clientId,
  });
}

const DENIED = "Only Owners and Admins can change the statuses.";

// Everything a change to a list can move: the lists, which posts are
// hidden, the counts, and what posts show.
async function invalidateStatuses(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.invalidateQueries({ queryKey: ["stage-statuses"], refetchType: "all" });
  await queryClient.invalidateQueries({ queryKey: ["hidden-statuses"], refetchType: "all" });
  await queryClient.invalidateQueries({ queryKey: ["project-creative-stats"] });
  await queryClient.invalidateQueries({ queryKey: ["agency-creative-stats"] });
  await queryClient.invalidateQueries({ queryKey: ["creatives"], refetchType: "all" });
  await queryClient.invalidateQueries({ queryKey: ["creative"] });
}

function useStatusMutation<T>(run: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: T) => {
      // A write RLS blocks changes nothing and reports no error, so every
      // write asks its rows back and treats none as refused.
      const rows = await run(input);
      if (!rows || (Array.isArray(rows) && !rows.length)) throw new Error(DENIED);
    },
    onSuccess: () => invalidateStatuses(queryClient),
  });
}

export function useAddStatus(list: StatusList | undefined) {
  return useStatusMutation(async (input: { stage: number; label: string; position: number }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await signedInUser(supabase);
    const { data, error } = await supabase
      .from("stage_statuses")
      .insert({ agency_id: list!.agencyId, client_id: list!.clientId, created_by: user?.id ?? null, ...input })
      .select("id");
    if (error) throw error;
    return data;
  });
}

// Whether a status's posts are hidden (phase143).
export function useSetStatusHides() {
  return useStatusMutation(async (input: { id: string; hides: boolean }) => {
    const { data, error } = await createClient().from("stage_statuses").update({ hides_post: input.hides }).eq("id", input.id).select("id");
    if (error) throw error;
    return data;
  });
}

// Every status the person can read that hides its posts (phase143), across
// lists: the lists, the feed grid and the counts leave those posts out.
// The team's only: a client reads no statuses, and never sees a post in the
// stages that can hide them.
export function useHiddenStatusIds() {
  return useQuery({
    queryKey: ["hidden-statuses"],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await createClient().from("stage_statuses").select("id").eq("hides_post", true);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.id as string));
    },
    staleTime: 60_000,
  });
}

// Whether a post is hidden by its status.
export const isHiddenPost = (post: { status_id?: string | null }, hidden: Set<string> | undefined) =>
  !!post.status_id && !!hidden?.has(post.status_id);

export function useRenameStatus() {
  return useStatusMutation(async (input: { id: string; label: string }) => {
    const { data, error } = await createClient().from("stage_statuses").update({ label: input.label }).eq("id", input.id).select("id");
    if (error) throw error;
    return data;
  });
}

// Two statuses swap places.
export function useSwapStatuses() {
  return useStatusMutation(async (input: { a: StageStatus; b: StageStatus }) => {
    const supabase = createClient();
    // Their places as they are in the list, so equal positions still swap.
    const [pa, pb] = input.a.position === input.b.position ? [0, 1] : [input.a.position, input.b.position];
    const first = await supabase.from("stage_statuses").update({ position: pb }).eq("id", input.a.id).select("id");
    if (first.error) throw first.error;
    const second = await supabase.from("stage_statuses").update({ position: pa }).eq("id", input.b.id).select("id");
    if (second.error) throw second.error;
    return [...(first.data ?? []), ...(second.data ?? [])].length === 2 ? second.data : [];
  });
}

export function useDeleteStatus() {
  return useStatusMutation(async (id: string) => {
    const { data, error } = await createClient().from("stage_statuses").delete().eq("id", id).select("id");
    if (error) throw error;
    return data;
  });
}

// A client to its own list (a copy of the agency's) or back to the
// agency's (phase151); its posts follow by name.
export function useSetClientOwnStatuses(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (own: boolean) => {
      const { error } = await createClient().rpc("set_client_own_statuses", { p_client_id: clientId, p_own: own });
      if (error) throw error;
    },
    onSuccess: () => invalidateStatuses(queryClient),
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
