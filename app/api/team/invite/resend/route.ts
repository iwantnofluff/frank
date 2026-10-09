import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send-email";
import { inviteEmail } from "@/lib/email/invite-email";
import { createInviteToken } from "@/lib/invites/token";
import { INVITE_TTL_MS } from "@/lib/invites/constants";
import { ROLE_LABELS, type AgencyRole } from "@/lib/roles";

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

// Resending a pending invite (phase49): the old link stops working and a new
// one is emailed, and returned to share directly. Everything goes through
// the caller's own session, so the invites policies decide who may: whoever
// manages the person (below them), or the Admin who invited them.
export async function POST(request: Request) {
  let body: { membershipId?: string };
  try {
    body = await request.json();
  } catch {
    return fail("Invalid request", 400);
  }
  if (!body.membershipId) return fail("Invalid request", 400);

  const supabase = await createClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();
  if (!caller) return fail("Not signed in", 401);

  const { data: m } = await supabase
    .from("memberships")
    .select("id, agency_id, role, client_id, accepted_at, removed_at, user:users!memberships_user_id_fkey(email)")
    .eq("id", body.membershipId)
    .maybeSingle();
  const member = m as unknown as {
    id: string;
    agency_id: string;
    role: AgencyRole;
    client_id: string | null;
    accepted_at: string | null;
    removed_at: string | null;
    user: { email: string } | null;
  } | null;
  if (!member?.user) return fail("Invite not found", 404);
  if (member.accepted_at) return fail("They've already joined", 409);
  if (member.removed_at) return fail("They were deactivated — reactivate them instead", 409);

  // The new link first, then the old ones go: if the new one is refused,
  // the old one still works.
  const { token, tokenHash } = createInviteToken();
  const { data: created, error: insertError } = await supabase
    .from("invites")
    .insert({
      membership_id: member.id,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
      created_by: caller.id,
    })
    .select("id")
    .single();
  if (insertError || !created) return fail("You can only resend invites for people below you", 403);
  const { error: deleteError } = await supabase
    .from("invites")
    .delete()
    .eq("membership_id", member.id)
    .is("accepted_at", null)
    .neq("id", created.id);
  if (deleteError) return fail(deleteError.message, 500);

  const [{ data: agency }, { data: inviter }, { data: client }] = await Promise.all([
    supabase.from("agencies").select("name").eq("id", member.agency_id).single(),
    supabase.from("users").select("name").eq("id", caller.id).single(),
    member.client_id
      ? supabase.from("clients").select("name").eq("id", member.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const url = `${new URL(request.url).origin}/invite/${token}`;
  const message = inviteEmail({
    agencyName: agency?.name ?? "a workspace",
    inviterName: inviter?.name ?? "Your team",
    roleLabel: member.client_id ? `a reviewer for ${client?.name ?? "a client"}` : ROLE_LABELS[member.role],
    url,
  });
  try {
    await sendEmail({ to: member.user.email, ...message });
  } catch (e) {
    return NextResponse.json({ url, emailError: (e as Error).message });
  }
  return NextResponse.json({ url });
}
