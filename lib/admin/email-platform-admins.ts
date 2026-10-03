import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/send-email";
import { escapeHtml } from "@/lib/email/invite-email";
import { wantsNotification, type AdminNotification, type AdminNotificationPrefs } from "./notifications";

// Tells everyone on platform_admins something (service role), except those
// who've switched that kind of email off. Best effort: whatever prompted it
// has already happened, so a failure here is swallowed.
export async function emailPlatformAdmins(admin: SupabaseClient, kind: AdminNotification, subject: string, text: string) {
  try {
    const { data: admins } = await admin.from("platform_admins").select("user_id");
    for (const { user_id } of admins ?? []) {
      const { data } = await admin.auth.admin.getUserById(user_id as string);
      const user = data?.user;
      if (!user?.email) continue;
      if (!wantsNotification(user.app_metadata?.notifications as AdminNotificationPrefs | undefined, kind)) continue;
      await sendEmail({ to: user.email, subject, text, html: `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>` });
    }
  } catch {
    // The admin area shows it either way.
  }
}
