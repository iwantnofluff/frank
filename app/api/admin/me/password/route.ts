import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin/require-platform-admin";
import { passwordIsRight } from "@/lib/admin/check-password";
import { MIN_PASSWORD_LENGTH } from "@/lib/invites/constants";

// A platform admin changes their password, after giving the current one.
export async function POST(request: Request) {
  const auth = await requirePlatformAdmin();
  if ("error" in auth) return auth.error;
  const { current, next } = (await request.json().catch(() => ({}))) as { current?: string; next?: string };
  if (!current || !next) return NextResponse.json({ error: "Enter both passwords" }, { status: 400 });
  if (next.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `Use at least ${MIN_PASSWORD_LENGTH} characters for the new password` }, { status: 400 });
  }
  if (!(await passwordIsRight(auth.user.email!, current))) {
    return NextResponse.json({ error: "Your current password isn't right" }, { status: 403 });
  }
  const { error } = await auth.admin.auth.admin.updateUserById(auth.user.id, { password: next });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
