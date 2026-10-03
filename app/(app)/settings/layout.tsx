"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useIsStaff } from "@/hooks/use-is-staff";
import { SettingsNav } from "@/components/settings/SettingsNav";

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
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { isStaff, isPending } = useIsStaff();

  useEffect(() => {
    if (!isPending && !isStaff) router.replace("/dashboard");
  }, [isPending, isStaff, router]);

  if (isPending || !isStaff) return null;

  return (
    <div className="setwrap">
      <SettingsNav pathname={pathname} />
      <div className="review-sep" aria-hidden="true" />
      <div className="setmain">{children}</div>
    </div>
  );
}
