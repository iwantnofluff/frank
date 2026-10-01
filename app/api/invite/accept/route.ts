import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { lookupInvite } from "@/lib/invites/lookup";
import { BIO_MAX, MIN_PASSWORD_LENGTH } from "@/lib/invites/constants";

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    token?: string;
    first_name?: string;
    last_name?: string;
    designation?: string;
    bio?: string;
    password?: string;
  } | null;
  if (!body?.token) return fail("This invite link isn't valid", 400);

  const admin = createServiceRoleClient();
  const invite = await lookupInvite(admin, body.token);
  if (invite.status === "expired") return fail("This invite has expired", 410);
  if (invite.status === "accepted") return fail("This invite has already been used", 409);
  if (invite.status !== "ok") return fail("This invite link isn't valid", 404);

  if (invite.needsPassword) {
    const first = body.first_name?.trim() ?? "";
    const last = body.last_name?.trim() ?? "";
    const designation = body.designation?.trim() ?? "";
    const bio = body.bio?.trim() ?? "";
    const password = body.password ?? "";
    if (!first) return fail("Enter your first name", 400);
    if (!last) return fail("Enter your last name", 400);
    if (!designation) return fail("Enter your designation", 400);
    if (bio.length > BIO_MAX) return fail(`Keep your bio under ${BIO_MAX} characters`, 400);
    if (password.length < MIN_PASSWORD_LENGTH) {
      return fail(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password`, 400);
    }
    const { error: pwError } = await admin.auth.admin.updateUserById(invite.userId, { password });
    if (pwError) return fail(pwError.message, 400);
    // Title case is applied by the users_normalise_profile trigger, which
    // also rebuilds users.name from the two halves.
    const { error: profileError } = await admin
      .from("users")
      .update({ first_name: first, last_name: last, designation, bio: bio || null })
      .eq("id", invite.userId);
    if (profileError) return fail(profileError.message, 500);
  }

  const now = new Date().toISOString();
  const { data: accepted, error: memberError } = await admin
    .from("memberships")
    .update({ accepted_at: now })
    .eq("id", invite.membershipId)
    .is("accepted_at", null)
    .select("id");
  if (memberError) return fail(memberError.message, 500);
  if (!accepted?.length) return fail("This invite has already been used", 409);

  const { error: inviteError } = await admin
    .from("invites")
    .update({ accepted_at: now })
    .eq("id", invite.inviteId);
  if (inviteError) return fail(inviteError.message, 500);

  return NextResponse.json({
    email: invite.email,
    agencyId: invite.agencyId,
    needsPassword: invite.needsPassword,
  });
}
