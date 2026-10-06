"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// A User on the team who could be given a client (phase59/62). Only the
// team's Users: a client's own people are invited from its settings, never
// picked from another client's (decided directly).
export interface AddablePerson {
  userId: string;
  name: string;
  email: string;
}

type Row = {
  id: string;
  user_id: string;
  user: { name: string | null; email: string } | null;
};

// Every User who has joined and hasn't got this client yet, alphabetically.
// Owners and Admins aren't listed: they see every client already.
export function useAddablePeople(clientId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["addable-people", clientId],
    queryFn: async (): Promise<AddablePerson[]> => {
      const supabase = createClient();
      const [{ data: rows, error }, { data: grants, error: grantsError }] = await Promise.all([
        supabase
          .from("memberships")
          .select("id, user_id, user:users!memberships_user_id_fkey(name, email)")
          .eq("role", "user")
          .is("client_id", null)
          .is("removed_at", null)
          .not("accepted_at", "is", null),
        supabase.from("staff_client_access").select("membership_id").eq("client_id", clientId),
      ]);
      if (error) throw error;
      if (grantsError) throw grantsError;
      const granted = new Set((grants ?? []).map((g) => g.membership_id as string));
      return (rows as unknown as Row[])
        .filter((m) => !granted.has(m.id))
        .map((m) => ({
          userId: m.user_id,
          name: m.user?.name?.trim() || m.user?.email || "Someone",
          email: m.user?.email ?? "",
        }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    },
    enabled: !!clientId && enabled,
  });
}

// Giving them this client, straight away (decided directly: they're on the
// team already, so no invite link). The database decides who may
// (add_person_to_client).
export function useAddPersonToClient(agencyId: string, clientId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, projectIds }: { userId: string; projectIds: string[] | null }) => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("add_person_to_client", {
        p_user_id: userId,
        p_client_id: clientId,
        p_project_ids: projectIds,
      });
      if (error) throw error;
      if (!data) throw new Error("Couldn't add them to this client");
      return data as string;
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["addable-people", clientId] }),
        queryClient.invalidateQueries({ queryKey: ["project-access"] }),
        queryClient.invalidateQueries({ queryKey: ["team-members", agencyId] }),
        queryClient.invalidateQueries({ queryKey: ["staff-client-access", agencyId] }),
      ]);
    },
  });
}
