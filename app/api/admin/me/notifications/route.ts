import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin/require-platform-admin";
import { ADMIN_NOTIFICATIONS, type AdminNotificationPrefs } from "@/lib/admin/notifications";

// The signed-in platform admin's email choices (Admin → Settings →
// Notifications), kept on their own account's app_metadata.
export async function GET() {
  const auth = await requirePlatformAdmin();
  if ("error" in auth) return auth.error;
  const { data } = await auth.admin.auth.admin.getUserById(auth.user.id);
  return NextResponse.json({ prefs: (data.user?.app_metadata?.notifications ?? {}) as AdminNotificationPrefs });
}

export async function PATCH(request: Request) {
  const auth = await requirePlatformAdmin();
  if ("error" in auth) return auth.error;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const prefs: AdminNotificationPrefs = {};
  for (const { key } of ADMIN_NOTIFICATIONS) if (typeof body[key] === "boolean") prefs[key] = body[key] as boolean;
  const { data } = await auth.admin.auth.admin.getUserById(auth.user.id);
  const merged = { ...(data.user?.app_metadata?.notifications ?? {}), ...prefs };
  const { error } = await auth.admin.auth.admin.updateUserById(auth.user.id, {
    app_metadata: { ...(data.user?.app_metadata ?? {}), notifications: merged },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prefs: merged });
}
