import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/send-email";
import { escapeHtml } from "@/lib/email/invite-email";

// Tells everyone on platform_admins something (service role). Best effort:
// whatever prompted it has already happened, so a failure here is swallowed.
export async function emailPlatformAdmins(admin: SupabaseClient, subject: string, text: string) {
  try {
    const { data: admins } = await admin.from("platform_admins").select("user:users(email)");
    const to = (admins ?? [])
      .map((a) => (a.user as unknown as { email: string } | null)?.email)
      .filter((e): e is string => !!e);
    for (const email of to) {
      await sendEmail({ to: email, subject, text, html: `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>` });
    }
  } catch {
    // The admin area shows it either way.
  }
}
