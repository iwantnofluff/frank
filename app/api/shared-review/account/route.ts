import { NextResponse } from "next/server";
import { createAnonServerClient } from "@/lib/supabase/anon-server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sendEmail } from "@/lib/email/send-email";
import { activateEmail } from "@/lib/email/activate-email";
import { createInviteToken } from "@/lib/invites/token";
import { INVITE_TTL_MS, MIN_PASSWORD_LENGTH } from "@/lib/invites/constants";

// Create an account, from a review link (direct instruction): the person
// picks a password in a window on the link, then activates the account from
// an email to that name's own address (the one the team invited them as
// Client with) by logging in with that password. Both are needed: anyone
// with the link can pick any name, so the email alone, or the password
// alone, turns nothing on (app/api/invite/activate checks the signed-in
// person is the invite's). Clients get no access until accepted
// (current_client_ids), so a password set here opens nothing by itself.
// The token (and passcode) are checked by get_shared_review first, as for
// everything on the link.
//
// step "check": new (needs a password), existing (already uses Frank: their
// own password, never changed here), has_account (joined), not_invited,
// already_sent (one in the last few minutes), not_found.
// step "send": sent, short_password, already_sent, and the above.
const RESEND_AFTER_MS = 10 * 60 * 1000;

function reply(status: string, httpStatus = 200) {
  return NextResponse.json({ status }, { status: httpStatus });
}

export async function POST(request: Request) {
  let body: {
    token?: string;
    passcode?: string | null;
    email?: string;
    step?: "check" | "send";
    password?: string;
    // The review link to come back to, signed in (direct instruction).
    back?: string;
  };
  try {
    body = await request.json();
  } catch {
    return reply("not_found", 400);
  }
  const { token, passcode } = body;
  const email = body.email?.trim().toLowerCase();
  if (!token || !email) return reply("not_found", 400);

  const anon = createAnonServerClient();
  const { data, error } = await anon.rpc("get_shared_review", { p_token: token, p_passcode: passcode ?? null });
  if (error || data?.status !== "ok") return reply("not_found", 404);
  // Only a name on this link's list (not archived: the function lists only those).
  const contacts = (data.contacts ?? []) as { email: string }[];
  if (!contacts.some((c) => c.email.toLowerCase() === email)) return reply("not_found", 404);

  const admin = createServiceRoleClient();
  const { data: link } = await admin
    .from("shared_links")
    .select("agency_id, agencies(name, suspended_at), projects(client_id, clients(name))")
    .eq("token", token)
    .maybeSingle();
  const row = link as unknown as {
    agency_id: string;
    agencies: { name: string; suspended_at: string | null } | null;
    projects: { client_id: string; clients: { name: string } | null } | null;
  } | null;
  const clientId = row?.projects?.client_id;
  if (!row || !clientId || row.agencies?.suspended_at) return reply("not_found", 404);

  const { data: person } = await admin.from("users").select("id").ilike("email", email).maybeSingle();
  if (!person) return reply("not_invited");
  const { data: m } = await admin
    .from("memberships")
    .select("id, agency_id, accepted_at, invited_by")
    .eq("user_id", person.id)
    .eq("client_id", clientId)
    .is("removed_at", null)
    .maybeSingle();
  if (!m) return reply("not_invited");
  if (m.accepted_at) return reply("has_account");
  // Invited before invited_by was kept: theirs is the senior team's (an Owner or Admin).
  const invitedBy =
    (m.invited_by as string | null) ??
    ((
      await admin
        .from("memberships")
        .select("user_id")
        .eq("agency_id", m.agency_id)
        .in("role", ["primary_owner", "owner", "admin"])
        .is("client_id", null)
        .is("removed_at", null)
        .limit(1)
        .maybeSingle()
    ).data?.user_id as string | undefined);
  if (!invitedBy) return reply("error", 500);

  // Signed in before (another workspace, say): their own password stands.
  const { data: authUser } = await admin.auth.admin.getUserById(person.id);
  const isNew = !authUser.user?.last_sign_in_at;

  // Pressed again (or by someone else picking the same name): one email per
  // few minutes, so the link can't be used to flood their inbox.
  const { data: recent } = await admin
    .from("invites")
    .select("id")
    .eq("membership_id", m.id)
    .is("accepted_at", null)
    .gt("created_at", new Date(Date.now() - RESEND_AFTER_MS).toISOString())
    .limit(1);
  if (recent?.length) return reply("already_sent");
  if (body.step !== "send") return reply(isNew ? "new" : "existing");

  if (isNew) {
    const password = body.password ?? "";
    if (password.length < MIN_PASSWORD_LENGTH) return reply("short_password", 400);
    const { error: pwError } = await admin.auth.admin.updateUserById(person.id, { password });
    if (pwError) return reply("short_password", 400);
  }

  // As Resend Invite does: the new link first, then the old ones go. It's
  // the invite the team sent, so it's theirs (created_by: who invited them).
  const { token: inviteToken, tokenHash } = createInviteToken();
  const { data: created, error: insertError } = await admin
    .from("invites")
    .insert({
      agency_id: m.agency_id,
      membership_id: m.id,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
      created_by: invitedBy,
    })
    .select("id")
    .single();
  if (insertError || !created) return reply("error", 500);
  await admin.from("invites").delete().eq("membership_id", m.id).is("accepted_at", null).neq("id", created.id);

  const back = body.back && /^\/review\/[A-Za-z0-9/_-]+$/.test(body.back) ? body.back : null;
  const message = activateEmail({
    agencyName: row.agencies?.name ?? "a workspace",
    clientName: row.projects?.clients?.name ?? "your",
    isNew,
    url: `${new URL(request.url).origin}/invite/activate/${inviteToken}${back ? `?back=${encodeURIComponent(back)}` : ""}`,
  });
  try {
    await sendEmail({ to: email, ...message });
  } catch {
    return reply("error", 502);
  }
  return reply("sent");
}
