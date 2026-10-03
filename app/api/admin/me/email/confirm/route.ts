import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin/require-platform-admin";
import { readEmailChangeToken } from "@/lib/admin/email-change-token";
import { sendEmail } from "@/lib/email/send-email";

// Following the link sent to the new address: the change happens now, for
// the admin it was made for, and the old address is told.
export async function POST(request: Request) {
  const auth = await requirePlatformAdmin();
  if ("error" in auth) return auth.error;
  const { token } = (await request.json().catch(() => ({}))) as { token?: string };
  const change = token ? readEmailChangeToken(token) : null;
  if (!change || change.userId !== auth.user.id) {
    return NextResponse.json({ error: "This link has expired or isn't for this account." }, { status: 400 });
  }
  const old = auth.user.email;
  const { error } = await auth.admin.auth.admin.updateUserById(auth.user.id, { email: change.email, email_confirm: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const { error: rowError } = await auth.admin.from("users").update({ email: change.email }).eq("id", auth.user.id);
  if (rowError) return NextResponse.json({ error: rowError.message }, { status: 500 });
  if (old) {
    const text = `Your Frank Admin sign-in email was changed from ${old} to ${change.email}. If that wasn't you, tell the Frank team straight away.`;
    await sendEmail({ to: old, subject: "Your Frank Admin email was changed", text, html: `<p>${text}</p>` }).catch(() => {});
  }
  return NextResponse.json({ email: change.email });
}
