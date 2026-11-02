import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isStaffServer } from "@/lib/is-staff-server";
import { SettingsShell } from "@/components/settings/SettingsShell";

// Settings is a left menu of sections and pages (lib/settings-nav.ts,
// SettingsNav) beside the page you're on — which owns its own .pad and
// heading, same as every other page in the app.
//
// Also the one guard point for every /settings/* route (this layout wraps
// all of them, including the /settings index redirect): NavRail hides the
// Settings nav item for a client-role session, but that's reachability,
// not enforcement — a client typing the URL directly would otherwise still
// render staff configuration (agency branding, team roster, format
// directions), same permission gap the prototype's syncRail() closes by
// hiding Settings from client mode entirely. Redirects rather than 404s or
// an inline "forbidden" message, since there's no such page in this app
// yet and a client landing on their dashboard is a real, useful place to
// end up rather than a dead end.
//
// Checked here on the server (speed pass, 2 Nov 2026): the page arrives
// drawn, rather than blank until the browser had asked who you are.
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  if (!(await isStaffServer(await createClient()))) redirect("/dashboard");
  return <SettingsShell>{children}</SettingsShell>;
}
