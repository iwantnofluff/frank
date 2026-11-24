import { NextResponse } from "next/server";
import { createAnonServerClient } from "@/lib/supabase/anon-server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sendEmail } from "@/lib/email/send-email";
import { inviteEmail } from "@/lib/email/invite-email";
import { createInviteToken } from "@/lib/invites/token";
import { INVITE_TTL_MS } from "@/lib/invites/constants";

// Create an account, from a review link (direct instruction): whoever picked
// a name under Who are you? is emailed a fresh invite to that name's own
// address, the one the team invited them as Client with. The link is never
// returned here, only emailed, so picking someone else's name gets nobody
// in. The token (and passcode) are checked by get_shared_review first, as
// for everything on the link; an account is optional and changes nothing
// about commenting.
//
// Statuses: sent, already_sent (one in the last few minutes; not sent
// again), has_account, not_invited (a name on the list with no Client
// invite behind it), not_found.
const RESEND_AFTER_MS = 10 * 60 * 1000;

function reply(status: string, httpStatus = 200) {
  return NextResponse.json({ status }, { status: httpStatus });
}

export async function POST(request: Request) {
  let body: { token?: string; passcode?: string | null; email?: string };
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

  const { data: inviter } = await admin.from("users").select("name").eq("id", invitedBy).maybeSingle();
  const message = inviteEmail({
    agencyName: row.agencies?.name ?? "a workspace",
    inviterName: inviter?.name ?? row.agencies?.name ?? "Your team",
    roleLabel: `a reviewer for ${row.projects?.clients?.name ?? "a client"}`,
    url: `${new URL(request.url).origin}/invite/${inviteToken}`,
  });
  try {
    await sendEmail({ to: email, ...message });
  } catch {
    return reply("error", 502);
  }
  return reply("sent");
}
