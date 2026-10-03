import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin/require-platform-admin";
import { passwordIsRight } from "@/lib/admin/check-password";
import { makeEmailChangeToken } from "@/lib/admin/email-change-token";
import { sendEmail } from "@/lib/email/send-email";
import { escapeHtml } from "@/lib/email/invite-email";

// A platform admin asks to sign in with another email. Nothing changes yet:
// a link goes to the new address, and only following it makes the change
// (./confirm), so a typo can't lock anyone out.
export async function POST(request: Request) {
  const auth = await requirePlatformAdmin();
  if ("error" in auth) return auth.error;
  const body = (await request.json().catch(() => ({}))) as { email?: string; current?: string };
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter the new email" }, { status: 400 });
  if (email === auth.user.email) return NextResponse.json({ error: "That's your email already" }, { status: 400 });
  if (!body.current || !(await passwordIsRight(auth.user.email!, body.current))) {
    return NextResponse.json({ error: "Your current password isn't right" }, { status: 403 });
  }
  const { data: taken } = await auth.admin.from("users").select("id").eq("email", email).maybeSingle();
  if (taken) return NextResponse.json({ error: "That email already has a Frank account" }, { status: 409 });

  const url = `${new URL(request.url).origin}/admin/confirm-email?token=${encodeURIComponent(makeEmailChangeToken(auth.user.id, email))}`;
  const text = `Confirm ${email} as your Frank Admin sign-in: ${url}\n\nThe link works for an hour. If you didn't ask for this, ignore this email and nothing changes.`;
  try {
    await sendEmail({
      to: email,
      subject: "Confirm your new Frank Admin email",
      text,
      html: `<p>Confirm <b>${escapeHtml(email)}</b> as your Frank Admin sign-in:</p><p><a href="${escapeHtml(url)}">Confirm the new email</a></p><p style="color:#888">The link works for an hour. If you didn't ask for this, ignore this email and nothing changes.</p>`,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
  return NextResponse.json({ sentTo: email });
}
