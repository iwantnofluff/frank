import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin/require-platform-admin";
import { REASON_REQUIRED, logAction, reasonFrom } from "@/lib/admin/actions";
import { agencyOrigin } from "@/lib/admin/agency-origin";
import { resetPasswordEmail } from "@/lib/email/reset-password-email";
import { sendEmail } from "@/lib/email/send-email";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

// The admin sends someone a password-reset link (phase51), to the address
// of the agency chosen (they may be in several), and it's logged there.
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAdmin();
  if ("error" in auth) return auth.error;
  const { admin, user } = auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const reason = reasonFrom(body);
  if (!reason) return fail(REASON_REQUIRED, 400);

  const { data: person } = await admin.from("users").select("email, name").eq("id", id).maybeSingle();
  if (!person) return fail("No one with that id", 404);
  const { data: membership } = await admin
    .from("memberships")
    .select("agency_id, agency:agencies(name, subdomain)")
    .eq("user_id", id)
    .eq("agency_id", body.agencyId ?? "")
    .is("removed_at", null)
    .maybeSingle();
  const agency = (membership as unknown as { agency: { name: string; subdomain: string | null } | null } | null)?.agency;
  if (!membership || !agency?.subdomain) return fail("Choose an agency they're in", 400);

  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: person.email as string });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) return fail(error?.message ?? "Couldn't make a reset link", 500);
  const url = `${agencyOrigin(request, agency.subdomain)}/reset-password?token_hash=${encodeURIComponent(tokenHash)}`;
  try {
    await sendEmail({ to: person.email as string, ...resetPasswordEmail({ url, workspaceName: agency.name }) });
  } catch (e) {
    return fail(`The email didn't send: ${(e as Error).message}`, 502);
  }

  try {
    await logAction(admin, user, {
      agencyId: body.agencyId,
      action: "Sent a password reset",
      target: `${person.name || person.email} (${person.email})`,
      reason,
    });
  } catch (e) {
    return fail((e as Error).message, 500);
  }
  return NextResponse.json({ ok: true });
}
