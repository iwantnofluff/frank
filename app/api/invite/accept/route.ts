import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { lookupInvite } from "@/lib/invites/lookup";
import { MIN_PASSWORD_LENGTH } from "@/lib/invites/constants";

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    token?: string;
    name?: string;
    password?: string;
  } | null;
  if (!body?.token) return fail("This invite link isn't valid", 400);

  const admin = createServiceRoleClient();
  const invite = await lookupInvite(admin, body.token);
  if (invite.status === "expired") return fail("This invite has expired", 410);
  if (invite.status === "accepted") return fail("This invite has already been used", 409);
  if (invite.status !== "ok") return fail("This invite link isn't valid", 404);

  if (invite.needsPassword) {
    const name = body.name?.trim() ?? "";
    const password = body.password ?? "";
    if (!name) return fail("Enter your name", 400);
    if (password.length < MIN_PASSWORD_LENGTH) {
      return fail(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password`, 400);
    }
    const { error: pwError } = await admin.auth.admin.updateUserById(invite.userId, { password });
    if (pwError) return fail(pwError.message, 400);
    const { error: nameError } = await admin.from("users").update({ name }).eq("id", invite.userId);
    if (nameError) return fail(nameError.message, 500);
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

  return NextResponse.json({ email: invite.email, needsPassword: invite.needsPassword });
}
