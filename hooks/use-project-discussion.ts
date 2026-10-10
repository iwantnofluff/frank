"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface DiscussionMessage {
  id: string;
  parent_id: string | null;
  author_id: string;
  author_name: string | null;
  body: string;
  mentions: string[];
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

export interface TeamMember {
  user_id: string;
  name: string;
}

// A project's Discussion (phase84): the team's threads and their replies,
// oldest first. Two plain queries rather than an embed, as with comments
// (hooks/use-comments.ts).
export function useProjectDiscussion(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["project-discussion", projectId],
    enabled: enabled && !!projectId,
    queryFn: async (): Promise<DiscussionMessage[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("project_discussion")
        .select("id, parent_id, author_id, body, mentions, created_at, edited_at, deleted_at")
        .eq("project_id", projectId)
        .order("created_at");
      if (error) throw error;
      const ids = [...new Set(data.map((m) => m.author_id as string))];
      const names = new Map<string, string>();
      if (ids.length) {
        const { data: users, error: usersError } = await supabase.from("users").select("id, name").in("id", ids);
        if (usersError) throw usersError;
        for (const u of users) names.set(u.id, u.name);
      }
      return data.map((m) => ({ ...m, author_name: names.get(m.author_id) ?? null }) as DiscussionMessage);
    },
  });
}

// Who can be @mentioned: the project's team.
export function useProjectTeam(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["project-team", projectId],
    enabled: enabled && !!projectId,
    queryFn: async (): Promise<TeamMember[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("project_team_members", { p_project_id: projectId });
      if (error) throw error;
      return (data ?? []) as TeamMember[];
    },
  });
}

// Posting, replying, editing and deleting your own. Each checks a row came
// back: a blocked write reports nothing rather than failing on its own.
export function useDiscussionActions(projectId: string) {
  const queryClient = useQueryClient();
  const done = () => queryClient.invalidateQueries({ queryKey: ["project-discussion", projectId] });

  const post = useMutation({
    mutationFn: async ({ body, parentId, mentions }: { body: string; parentId: string | null; mentions: string[] }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("project_discussion")
        .insert({ project_id: projectId, parent_id: parentId, body: body.trim(), mentions })
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Couldn't post that.");
    },
    onSuccess: done,
  });

  const edit = useMutation({
    mutationFn: async ({ id, body, mentions }: { id: string; body: string; mentions: string[] }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("project_discussion")
        .update({ body: body.trim(), mentions })
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("You can only edit your own messages.");
    },
    onSuccess: done,
  });

  // Marked deleted, its words cleared, so replies keep their thread.
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("project_discussion")
        .update({ deleted_at: new Date().toISOString(), body: "Deleted", mentions: [] })
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("You can only delete your own messages.");
    },
    onSuccess: done,
  });

  return { post, edit, remove };
}
