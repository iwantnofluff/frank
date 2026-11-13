"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { signedInUser } from "@/lib/supabase/signed-in-user";

// Slack (phase154): the workspace's connection (Settings → Connections →
// Slack) and each project's channel (Project Settings). Owners and Admins
// change them; the team sees them.

// Whether Frank's Slack app is set up here at all.
export function useSlackConfigured() {
  return useQuery({
    queryKey: ["slack-configured"],
    queryFn: async () => {
      const res = await fetch("/api/connections/slack/status");
      return ((await res.json()) as { configured: boolean }).configured;
    },
    staleTime: Infinity,
  });
}

export interface SlackConnection {
  team_name: string;
  connected_by_name: string | null;
  connected_at: string;
}

export function useSlackConnection(agencyId: string | undefined) {
  return useQuery({
    queryKey: ["slack-connection", agencyId],
    queryFn: async (): Promise<SlackConnection | null> => {
      const { data, error } = await createClient().rpc("slack_connection_status", { p_agency_id: agencyId });
      if (error) throw error;
      return ((data ?? []) as SlackConnection[])[0] ?? null;
    },
    enabled: !!agencyId,
  });
}

export const addToSlackUrl = (agencyId: string) => `/api/connections/slack/start?agencyId=${encodeURIComponent(agencyId)}`;

export function useDisconnectSlack(agencyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await createClient().rpc("disconnect_slack", { p_agency_id: agencyId });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["slack-connection", agencyId], refetchType: "all" }),
  });
}

export interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
}

// The channels to choose from, read through the server (the key stays
// there). Asked for only while the picker is open.
export function useSlackChannels(agencyId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["slack-channels", agencyId],
    queryFn: async (): Promise<SlackChannel[]> => {
      const res = await fetch(`/api/connections/slack/channels?agencyId=${encodeURIComponent(agencyId!)}`);
      const body = (await res.json()) as { channels?: SlackChannel[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Couldn't list the channels.");
      return body.channels ?? [];
    },
    enabled: !!agencyId && enabled,
    staleTime: 60_000,
  });
}

export interface ProjectSlack {
  channel_id: string;
  channel_name: string;
  client_activity: boolean;
  team_comments: boolean;
  include_private: boolean;
  last_error: string | null;
  last_error_at: string | null;
}

export function useProjectSlack(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project-slack", projectId],
    queryFn: async (): Promise<ProjectSlack | null> => {
      const { data, error } = await createClient()
        .from("project_slack")
        .select("channel_id, channel_name, client_activity, team_comments, include_private, last_error, last_error_at")
        .eq("project_id", projectId!)
        .maybeSingle();
      if (error) throw error;
      return data as ProjectSlack | null;
    },
    enabled: !!projectId,
  });
}

const DENIED = "Only Owners and Admins can change a project's Slack channel.";

// A channel chosen, or a switch changed. A write RLS blocks changes nothing
// and reports no error, so the row is asked back.
export function useSaveProjectSlack(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Pick<ProjectSlack, "channel_id" | "channel_name" | "client_activity" | "team_comments" | "include_private">>) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await signedInUser(supabase);
      const fields = { ...patch, set_by: user?.id ?? null, updated_at: new Date().toISOString() };
      // A channel chosen makes the row; a switch only changes the one there
      // (an upsert without the channel would fail its not-null first).
      const { data, error } = patch.channel_id
        ? await supabase.from("project_slack").upsert({ project_id: projectId, ...fields }, { onConflict: "project_id" }).select("project_id")
        : await supabase.from("project_slack").update(fields).eq("project_id", projectId).select("project_id");
      if (error) throw error;
      if (!data?.length) throw new Error(DENIED);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project-slack", projectId], refetchType: "all" }),
  });
}

export function useRemoveProjectSlack(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await createClient().from("project_slack").delete().eq("project_id", projectId).select("project_id");
      if (error) throw error;
      if (!data?.length) throw new Error(DENIED);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project-slack", projectId], refetchType: "all" }),
  });
}

// A project's Slack List (phase155): checked through the server from its
// link, then saved; the same three switches as its channel.
export interface ProjectSlackList {
  list_id: string;
  list_title: string;
  columns: Record<string, { id: string; type: string }>;
  client_activity: boolean;
  team_comments: boolean;
  include_private: boolean;
  last_error: string | null;
  last_error_at: string | null;
}

export function useProjectSlackList(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project-slack-list", projectId],
    queryFn: async (): Promise<ProjectSlackList | null> => {
      const { data, error } = await createClient()
        .from("project_slack_list")
        .select("list_id, list_title, columns, client_activity, team_comments, include_private, last_error, last_error_at")
        .eq("project_id", projectId!)
        .maybeSingle();
      if (error) throw error;
      return data as ProjectSlackList | null;
    },
    enabled: !!projectId,
  });
}

export function useConnectSlackList(projectId: string, agencyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (link: string) => {
      const res = await fetch("/api/connections/slack/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyId, link }),
      });
      const body = (await res.json()) as { listId?: string; title?: string; columns?: Record<string, unknown>; error?: string };
      if (!res.ok || !body.listId) throw new Error(body.error ?? "Couldn't connect that List.");
      const supabase = createClient();
      const {
        data: { user },
      } = await signedInUser(supabase);
      const { data, error } = await supabase
        .from("project_slack_list")
        .upsert(
          {
            project_id: projectId,
            list_id: body.listId,
            list_title: body.title,
            columns: body.columns,
            last_error: null,
            last_error_at: null,
            set_by: user?.id ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "project_id" },
        )
        .select("project_id");
      if (error) throw error;
      if (!data?.length) throw new Error(DENIED);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project-slack-list", projectId], refetchType: "all" }),
  });
}

export function useSaveProjectSlackList(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Pick<ProjectSlackList, "client_activity" | "team_comments" | "include_private">>) => {
      const { data, error } = await createClient()
        .from("project_slack_list")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("project_id", projectId)
        .select("project_id");
      if (error) throw error;
      if (!data?.length) throw new Error(DENIED);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project-slack-list", projectId], refetchType: "all" }),
  });
}

export function useRemoveProjectSlackList(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await createClient().from("project_slack_list").delete().eq("project_id", projectId).select("project_id");
      if (error) throw error;
      if (!data?.length) throw new Error(DENIED);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project-slack-list", projectId], refetchType: "all" }),
  });
}

