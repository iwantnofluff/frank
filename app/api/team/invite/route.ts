import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sendEmail } from "@/lib/email/send-email";
import { inviteEmail } from "@/lib/email/invite-email";
import { createInviteToken } from "@/lib/invites/token";
import { INVITE_TTL_MS } from "@/lib/invites/constants";
import { INVITABLE_ROLES, ROLE_LABELS, type InvitableRole } from "@/lib/roles";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

// Every write that decides *who* may do *what* goes through the caller's own
// session, so the memberships/staff_client_access/invites policies make the
// call. The service-role client is used only for what no caller's session
// can do: look a user up by email across agencies, and create the account.
export async function POST(request: Request) {
  let body: { agencyId?: string; email?: string; role?: string; clientIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return fail("Invalid request", 400);
  }

  const agencyId = body.agencyId;
  const email = body.email?.trim().toLowerCase() ?? "";
  const role = body.role as InvitableRole;
  const clientIds = role === "user" ? (body.clientIds ?? []) : [];
  if (!agencyId) return fail("Invalid request", 400);
  if (!EMAIL_RE.test(email)) return fail("Enter a valid email", 400);
  if (!INVITABLE_ROLES.includes(role)) return fail("Choose a role", 400);

  const supabase = await createClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();
  if (!caller) return fail("Not signed in", 401);

  const { data: allowed } = await supabase.rpc("is_agency_owner_or_above", {
    check_agency_id: agencyId,
  });
  if (!allowed) return fail("Only an Owner or the Primary Owner can invite people", 403);

  const [{ data: agency }, { data: inviter }] = await Promise.all([
    supabase.from("agencies").select("name").eq("id", agencyId).single(),
    supabase.from("users").select("name").eq("id", caller.id).single(),
  ]);

  const admin = createServiceRoleClient();
  const { data: existingUser } = await admin
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  let userId = existingUser?.id as string | undefined;
  let createdUser = false;
  let membershipId: string | undefined;

  if (userId) {
    const { data: deactivated } = await admin
      .from("memberships")
      .select("id")
      .eq("agency_id", agencyId)
      .eq("user_id", userId)
      .is("client_id", null)
      .not("removed_at", "is", null)
      .is("removed_permanently_at", null)
      .limit(1);
    if (deactivated?.length) {
      return fail(`${email} was deactivated — reactivate them from the Team list instead`, 409);
    }
    const { data: existing } = await admin
      .from("memberships")
      .select("id, role, accepted_at")
      .eq("agency_id", agencyId)
      .eq("user_id", userId)
      .is("client_id", null)
      .is("removed_at", null)
      .maybeSingle();
    if (existing?.accepted_at) return fail(`${email} is already on the team`, 409);
    if (existing && existing.role !== role) {
      return fail(
        `${email} already has a pending invite as ${ROLE_LABELS[existing.role as InvitableRole]}`,
        409,
      );
    }
    if (existing) {
      // Re-sending: the old link stops working, the new one replaces it.
      const { error } = await supabase
        .from("invites")
        .delete()
        .eq("membership_id", existing.id)
        .is("accepted_at", null);
      if (error) return fail(error.message, 500);
      membershipId = existing.id;
    }
  } else {
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (error || !created.user) return fail(error?.message ?? "Couldn't create the account", 500);
    userId = created.user.id;
    createdUser = true;
    const { error: userError } = await admin
      .from("users")
      .insert({ id: userId, email, name: email.split("@")[0] });
    if (userError) {
      await admin.auth.admin.deleteUser(userId);
      return fail(userError.message, 500);
    }
  }

  async function undoCreatedUser() {
    if (!createdUser || !userId) return;
    await admin.from("users").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
  }

  if (!membershipId) {
    const { data: membership, error } = await supabase
      .from("memberships")
      .insert({
        agency_id: agencyId,
        user_id: userId,
        role,
        invited_by: caller.id,
        invited_at: new Date().toISOString(),
        accepted_at: null,
      })
      .select("id")
      .single();
    if (error || !membership) {
      await undoCreatedUser();
      return fail(error?.message ?? "Couldn't add the member", 403);
    }
    membershipId = membership.id;

    if (clientIds.length > 0) {
      const { error: accessError } = await supabase
        .from("staff_client_access")
        .insert(clientIds.map((client_id) => ({ membership_id: membershipId, client_id })));
      if (accessError) {
        await admin.from("memberships").delete().eq("id", membershipId);
        await undoCreatedUser();
        return fail(accessError.message, 500);
      }
    }
  }

  const { token, tokenHash } = createInviteToken();
  const { error: inviteError } = await supabase.from("invites").insert({
    membership_id: membershipId,
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
    created_by: caller.id,
  });
  if (inviteError) return fail(inviteError.message, 500);

  const url = `${new URL(request.url).origin}/invite/${token}`;
  const message = inviteEmail({
    agencyName: agency?.name ?? "your agency",
    inviterName: inviter?.name ?? "Your team",
    roleLabel: ROLE_LABELS[role],
    url,
  });
  try {
    await sendEmail({ to: email, ...message });
  } catch (e) {
    return NextResponse.json(
      {
        error: `The invite was created, but the email didn't send. ${(e as Error).message}`,
        membershipId,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ membershipId });
}
