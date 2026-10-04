"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Someone a client's projects can be shared with (phase46): a User given
// the client, or a Client from it. Owners and Admins aren't listed; they
// see every project.
export interface ClientPerson {
  membershipId: string;
  name: string;
  email: string;
  avatarAssetId: string | null;
  kind: "user" | "client";
  accepted: boolean;
  // The client's projects they're on.
  projectIds: string[];
}

// Everyone on a client, with their projects. Reads other people's access,
// which only Owners and Admins can (project_access_select) — pass enabled
// accordingly.
export function useClientPeople(clientId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["project-access", "client", clientId],
    queryFn: async (): Promise<ClientPerson[]> => {
      const supabase = createClient();
      const [{ data: grants, error: grantsError }, { data: projects, error: projectsError }] = await Promise.all([
        supabase.from("staff_client_access").select("membership_id").eq("client_id", clientId),
        supabase.from("projects").select("id").eq("client_id", clientId),
      ]);
      if (grantsError) throw grantsError;
      if (projectsError) throw projectsError;

      const granted = (grants ?? []).map((g) => g.membership_id as string);
      let people = supabase
        .from("memberships")
        .select("id, role, client_id, accepted_at, user:users!memberships_user_id_fkey(name, email, avatar_asset_id)")
        .is("removed_at", null);
      people = granted.length
        ? people.or(`client_id.eq.${clientId},and(client_id.is.null,role.eq.user,id.in.(${granted.join(",")}))`)
        : people.eq("client_id", clientId);
      const { data: members, error: membersError } = await people;
      if (membersError) throw membersError;

      const projectIds = (projects ?? []).map((p) => p.id as string);
      const memberIds = (members ?? []).map((m) => m.id as string);
      const { data: access, error: accessError } =
        memberIds.length && projectIds.length
          ? await supabase
              .from("project_access")
              .select("membership_id, project_id")
              .in("membership_id", memberIds)
              .in("project_id", projectIds)
          : { data: [], error: null };
      if (accessError) throw accessError;

      type Member = {
        id: string;
        client_id: string | null;
        accepted_at: string | null;
        user: { name: string; email: string; avatar_asset_id: string | null } | null;
      };
      return (members as unknown as Member[])
        .map((m) => ({
          membershipId: m.id,
          name: m.user?.name || m.user?.email || "Someone",
          email: m.user?.email ?? "",
          avatarAssetId: m.user?.avatar_asset_id ?? null,
          kind: (m.client_id ? "client" : "user") as ClientPerson["kind"],
          accepted: !!m.accepted_at,
          projectIds: (access ?? []).filter((a) => a.membership_id === m.id).map((a) => a.project_id as string),
        }))
        .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "user" ? -1 : 1));
    },
    enabled: !!clientId && enabled,
  });
}

// Putting someone on a project, or taking them off. Owners and Admins only
// (project_access policies); a write that changes nothing is an error, not
// a quiet success.
export function useSetProjectAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      membershipId,
      projectId,
      on,
    }: {
      membershipId: string;
      projectId: string;
      clientId: string;
      on: boolean;
    }) => {
      const supabase = createClient();
      const { data, error } = on
        ? await supabase.from("project_access").insert({ membership_id: membershipId, project_id: projectId }).select("id")
        : await supabase
            .from("project_access")
            .delete()
            .eq("membership_id", membershipId)
            .eq("project_id", projectId)
            .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Only Owners and Admins can change who's on a project.");
    },
    onSettled: async (_data, _error, { clientId }) => {
      await queryClient.invalidateQueries({ queryKey: ["project-access", "client", clientId] });
    },
  });
}

// Someone's projects on a client, all at once: from one list to another.
export function useSetPersonProjects() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      membershipId,
      from,
      to,
    }: {
      membershipId: string;
      clientId: string;
      from: string[];
      to: string[];
    }) => {
      const supabase = createClient();
      const adding = to.filter((id) => !from.includes(id));
      const removing = from.filter((id) => !to.includes(id));
      if (adding.length) {
        const { data, error } = await supabase
          .from("project_access")
          .insert(adding.map((project_id) => ({ membership_id: membershipId, project_id })))
          .select("id");
        if (error) throw error;
        if ((data?.length ?? 0) !== adding.length) throw new Error("Only Owners and Admins can change who's on a project.");
      }
      if (removing.length) {
        const { data, error } = await supabase
          .from("project_access")
          .delete()
          .eq("membership_id", membershipId)
          .in("project_id", removing)
          .select("id");
        if (error) throw error;
        if ((data?.length ?? 0) !== removing.length) throw new Error("Only Owners and Admins can change who's on a project.");
      }
    },
    onSettled: async (_data, _error, { clientId }) => {
      await queryClient.invalidateQueries({ queryKey: ["project-access", "client", clientId] });
    },
  });
}
