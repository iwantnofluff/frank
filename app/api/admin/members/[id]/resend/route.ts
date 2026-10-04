import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin/require-platform-admin";
import { REASON_REQUIRED, logAction, reasonFrom } from "@/lib/admin/actions";
import { agencyOrigin } from "@/lib/admin/agency-origin";
import { createInviteToken } from "@/lib/invites/token";
import { INVITE_TTL_MS } from "@/lib/invites/constants";
import { inviteEmail } from "@/lib/email/invite-email";
import { sendEmail } from "@/lib/email/send-email";
import { ROLE_LABELS, type AgencyRole } from "@/lib/roles";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

// The admin resends someone's pending invite (phase51): a new link to the
// agency's own address replaces the old one, and the action is logged.
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAdmin();
  if ("error" in auth) return auth.error;
  const { admin, user } = auth;
  const { id } = await ctx.params;
  const reason = reasonFrom(await request.json().catch(() => ({})));
  if (!reason) return fail(REASON_REQUIRED, 400);

  const { data: m } = await admin
    .from("memberships")
    .select("id, agency_id, role, client_id, accepted_at, removed_at, user:users!memberships_user_id_fkey(email, name), agency:agencies(name, subdomain)")
    .eq("id", id)
    .maybeSingle();
  const member = m as unknown as {
    id: string;
    agency_id: string;
    role: AgencyRole;
    client_id: string | null;
    accepted_at: string | null;
    removed_at: string | null;
    user: { email: string; name: string } | null;
    agency: { name: string; subdomain: string | null } | null;
  } | null;
  if (!member?.user || !member.agency) return fail("Invite not found", 404);
  if (member.accepted_at) return fail("They've already joined", 409);
  if (member.removed_at) return fail("They were deactivated", 409);
  if (!member.agency.subdomain) return fail("This agency has no address to invite people to", 409);

  const { token, tokenHash } = createInviteToken();
  const { error: insertError } = await admin.from("invites").insert({
    membership_id: member.id,
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
    created_by: user.id,
  });
  if (insertError) return fail(insertError.message, 500);
  await admin.from("invites").delete().eq("membership_id", member.id).is("accepted_at", null).neq("token_hash", tokenHash);

  let clientName: string | null = null;
  if (member.client_id) {
    clientName = ((await admin.from("clients").select("name").eq("id", member.client_id).maybeSingle()).data?.name as string) ?? null;
  }
  const url = `${agencyOrigin(request, member.agency.subdomain)}/invite/${token}`;
  let emailError: string | undefined;
  try {
    await sendEmail({
      to: member.user.email,
      ...inviteEmail({
        agencyName: member.agency.name,
        inviterName: "The Frank team",
        roleLabel: member.client_id ? `a reviewer for ${clientName ?? "a client"}` : ROLE_LABELS[member.role],
        url,
      }),
    });
  } catch (e) {
    emailError = (e as Error).message;
  }

  try {
    await logAction(admin, user, {
      agencyId: member.agency_id,
      action: "Resent an invite",
      target: `${member.user.name || member.user.email} (${member.user.email})`,
      detail: emailError ? `The email didn't send: ${emailError}` : null,
      reason,
    });
  } catch (e) {
    return fail((e as Error).message, 500);
  }
  return NextResponse.json({ url, emailError });
}
