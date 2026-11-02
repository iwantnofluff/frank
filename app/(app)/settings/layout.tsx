"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useIsStaff } from "@/hooks/use-is-staff";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { SettingsMain } from "@/components/settings/SettingsMain";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { FRANK_HOME_SUBDOMAIN, SETTINGS_SECTIONS, frankAdminSection } from "@/lib/settings-nav";
import { ROOT_DOMAIN } from "@/lib/tenant";

// Frank Admin's sign-in, beside this address: admin.beingfrank.app on
// live, admin.frank.localhost locally (from localhost too).
function adminSignInUrl() {
  const { protocol, hostname, port } = window.location;
  const local = hostname === "localhost" || hostname === "frank.localhost" || hostname.endsWith(".frank.localhost");
  const root = local ? "frank.localhost" : ROOT_DOMAIN;
  return `${protocol}//admin.${root}${port ? `:${port}` : ""}/login`;
}

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
  const { data: agency } = useMyAgency();
  const { data: membership } = useMyMembership(agency?.agencyId);
  const showAdmin = agency?.subdomain === FRANK_HOME_SUBDOMAIN && membership?.role === "primary_owner";

  useEffect(() => {
    if (!isPending && !isStaff) router.replace("/dashboard");
  }, [isPending, isStaff, router]);

  if (isPending || !isStaff) return null;

  return (
    <div className="setwrap">
      <SettingsNav
        pathname={pathname}
        sections={showAdmin ? [...SETTINGS_SECTIONS, frankAdminSection(adminSignInUrl())] : SETTINGS_SECTIONS}
      />
      <div className="review-sep" aria-hidden="true" />
      <SettingsMain>{children}</SettingsMain>
    </div>
  );
}
