"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { InvitableRole } from "@/lib/roles";

// RLS decides who may do this (Owner/Primary Owner, never on the Primary
// Owner's own row). A refused update or delete comes back as zero rows, not
// an error — so the row count is checked rather than trusting a clean return.
function assertAffected(rows: unknown[] | null) {
  if (!rows || rows.length === 0) {
    throw new Error("You don't have permission to change this member");
  }
}

export function useSetMemberActive(agencyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ membershipId, active }: { membershipId: string; active: boolean }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("memberships")
        .update({ removed_at: active ? null : new Date().toISOString() })
        .eq("id", membershipId)
        .select("id");
      if (error) throw error;
      assertAffected(data);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["team-members", agencyId] });
    },
  });
}

// Keeps the membership row (flagged) rather than deleting it — it's what
// links the person to this agency, so their name stays on past comments and
// work. Access goes with removed_at, the same as deactivating; the flag also
// drops them from the Team list. Their client grants go straight away.
export function useRemoveMember(agencyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (membershipId: string) => {
      const supabase = createClient();
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("memberships")
        .update({ removed_at: now, removed_permanently_at: now })
        .eq("id", membershipId)
        .select("id");
      if (error) throw error;
      assertAffected(data);
      const { error: grantsError } = await supabase
        .from("staff_client_access")
        .delete()
        .eq("membership_id", membershipId);
      if (grantsError) throw grantsError;
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["team-members", agencyId] });
      await queryClient.invalidateQueries({ queryKey: ["staff-client-access", agencyId] });
    },
  });
}

// A never-accepted invite has no past work to keep attributed, so the row
// goes entirely — its invite link cascades with it.
export function useRevokeInvite(agencyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (membershipId: string) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("memberships")
        .delete()
        .eq("id", membershipId)
        .is("accepted_at", null)
        .select("id");
      if (error) throw error;
      assertAffected(data);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["team-members", agencyId] });
    },
  });
}

// Role first, then the client grants brought in line with it: a User keeps
// exactly the clients picked; any other role sees every client, so its
// grants would only be stale rows and are cleared.
export function useUpdateMember(agencyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      membershipId,
      role,
      roleChanged,
      clientIds,
      currentClientIds,
    }: {
      membershipId: string;
      role: InvitableRole;
      roleChanged: boolean;
      clientIds: string[];
      currentClientIds: string[];
    }) => {
      const supabase = createClient();
      if (roleChanged) {
        const { data, error } = await supabase
          .from("memberships")
          .update({ role })
          .eq("id", membershipId)
          .select("id");
        if (error) throw error;
        assertAffected(data);
      }
      const keep = role === "user" ? clientIds : [];
      const toRemove = currentClientIds.filter((id) => !keep.includes(id));
      const toAdd = keep.filter((id) => !currentClientIds.includes(id));
      if (toRemove.length > 0) {
        const { data, error } = await supabase
          .from("staff_client_access")
          .delete()
          .eq("membership_id", membershipId)
          .in("client_id", toRemove)
          .select("id");
        if (error) throw error;
        if ((data ?? []).length !== toRemove.length) {
          throw new Error("You don't have permission to change this member's clients");
        }
      }
      if (toAdd.length > 0) {
        const { error } = await supabase
          .from("staff_client_access")
          .insert(toAdd.map((client_id) => ({ membership_id: membershipId, client_id })));
        if (error) throw error;
      }
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["team-members", agencyId] }),
        queryClient.invalidateQueries({ queryKey: ["staff-client-access", agencyId] }),
      ]);
    },
  });
}
