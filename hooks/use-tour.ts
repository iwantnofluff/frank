"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { signedInUser } from "@/lib/supabase/signed-in-user";

// Frank Tour has been shown to this person (phase144): kept on them, so it
// doesn't start on its own again on any device.
export function useMarkTourSeen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await signedInUser(supabase);
      if (!user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("users")
        .update({ tour_seen_at: new Date().toISOString() })
        .eq("id", user.id)
        .select("id");
      if (error) throw error;
      // A blocked update reports no error, only no rows.
      if (!data?.length) throw new Error("Couldn't save that you've seen the tour");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["my-profile"] }),
  });
}

export interface TourTargets {
  clientId: string | null;
  projectId: string | null;
  postId: string | null;
  // The sample's posts by what each shows best (the team's tours).
  posts?: { stages: string; comments: string; concept: string };
}

// The team's tours always use the workspace's sample client (phase146,
// decided directly): got ready first, made (hidden) or reset if it needs to
// be, so a tour never falls back on anything else. Once per tour run.
export function useSampleTargets(agencyId: string | undefined, run: number, enabled: boolean) {
  return useQuery({
    queryKey: ["tour-sample", agencyId, run],
    enabled: enabled && !!agencyId,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    queryFn: async (): Promise<TourTargets> => {
      const res = await fetch("/api/sample/ensure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't get the tour ready");
      return { clientId: data.clientId, projectId: data.projectId, postId: data.posts.stages, posts: data.posts };
    },
  });
}

// A client reviewer's tour (their own work, decided directly): the latest
// post they can see, its project and client; failing a post, the latest project; failing
// that, the latest client. Whatever's missing, its steps are left out.
export function useTourTargets(enabled: boolean) {
  return useQuery({
    queryKey: ["tour-targets"],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<TourTargets> => {
      const supabase = createClient();
      const { data: post, error } = await supabase
        .from("creatives")
        .select("id, project_id, projects(client_id)")
        .is("archived_at", null)
        .not("format", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (post) {
        const project = post.projects as unknown as { client_id: string } | null;
        return { clientId: project?.client_id ?? null, projectId: post.project_id as string, postId: post.id as string };
      }
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id, client_id")
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (projectError) throw projectError;
      if (project) return { clientId: project.client_id as string, projectId: project.id as string, postId: null };
      const { data: client, error: clientError } = await supabase
        .from("clients")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (clientError) throw clientError;
      return { clientId: (client?.id as string | undefined) ?? null, projectId: null, postId: null };
    },
  });
}
