import type { SupabaseClient } from "@supabase/supabase-js";
import { hashInviteToken } from "./token";
import type { AgencyRole } from "@/lib/roles";

export type InviteLookup =
  | { status: "not_found" | "expired" | "accepted" }
  | {
      status: "ok";
      inviteId: string;
      membershipId: string;
      agencyId: string;
      userId: string;
      email: string;
      agencyName: string;
      role: AgencyRole;
      // A Client (phase44): the client they're from.
      clientName: string | null;
      // Names the inviter gave, to start the form with.
      firstName: string | null;
      lastName: string | null;
      // A brand-new account (never signed in) sets a name and password here;
      // someone who already uses Frank just accepts and signs in as usual.
      needsPassword: boolean;
    };

// Service-role only: the caller has no session, so the token itself is the
// access decision — nothing is read before its hash matches a live invite.
export async function lookupInvite(admin: SupabaseClient, token: string): Promise<InviteLookup> {
  const { data: invite } = await admin
    .from("invites")
    .select(
      "id, expires_at, accepted_at, membership:memberships(id, agency_id, user_id, role, client_id, removed_at, accepted_at, agency:agencies(name), client:clients(name), user:users!memberships_user_id_fkey(email, first_name, last_name))",
    )
    .eq("token_hash", hashInviteToken(token))
    .maybeSingle();

  const m = invite?.membership as unknown as {
    id: string;
    agency_id: string;
    user_id: string;
    role: AgencyRole;
    removed_at: string | null;
    accepted_at: string | null;
    agency: { name: string } | null;
    client: { name: string } | null;
    user: { email: string; first_name: string | null; last_name: string | null } | null;
  } | null;

  if (!invite || !m || m.removed_at) return { status: "not_found" };
  if (invite.accepted_at || m.accepted_at) return { status: "accepted" };
  if (new Date(invite.expires_at).getTime() < Date.now()) return { status: "expired" };

  const { data: authUser } = await admin.auth.admin.getUserById(m.user_id);

  return {
    status: "ok",
    inviteId: invite.id,
    membershipId: m.id,
    agencyId: m.agency_id,
    userId: m.user_id,
    email: m.user?.email ?? authUser.user?.email ?? "",
    agencyName: m.agency?.name ?? "your agency",
    role: m.role,
    clientName: m.client?.name ?? null,
    firstName: m.user?.first_name ?? null,
    lastName: m.user?.last_name ?? null,
    needsPassword: !authUser.user?.last_sign_in_at,
  };
}
