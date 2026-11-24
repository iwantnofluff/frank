import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { lookupInvite } from "@/lib/invites/lookup";

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

// Activating an account made from a review link (direct instruction): the
// email's link proves the address, and the caller has just logged in with
// the password, so both are checked here. The session must be the invite's
// own person; only then is the membership accepted (as accepting an invite
// does), which is what lets a Client see anything.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  if (!body?.token) return fail("This link isn't valid", 400);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Log in first", 401);

  const admin = createServiceRoleClient();
  const invite = await lookupInvite(admin, body.token);
  if (invite.status === "expired") return fail("This link has expired", 410);
  if (invite.status === "accepted") return fail("This account is already active", 409);
  if (invite.status !== "ok") return fail("This link isn't valid", 404);
  if (invite.userId !== user.id) return fail("This link is for someone else", 403);

  const now = new Date().toISOString();
  const { data: accepted, error: memberError } = await admin
    .from("memberships")
    .update({ accepted_at: now })
    .eq("id", invite.membershipId)
    .is("accepted_at", null)
    .select("id, client_id");
  if (memberError) return fail(memberError.message, 500);
  if (!accepted?.length) return fail("This account is already active", 409);

  const { error: inviteError } = await admin.from("invites").update({ accepted_at: now }).eq("id", invite.inviteId);
  if (inviteError) return fail(inviteError.message, 500);

  return NextResponse.json({ clientId: accepted[0].client_id as string | null });
}
