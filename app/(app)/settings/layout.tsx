"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useIsStaff } from "@/hooks/use-is-staff";

const TABS = [
  { href: "/settings/brand", label: "Branding" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/knowledge", label: "Format directions" },
];

// Each tab's page owns its own .pad + heading, same as every other page in
// the app — this layout only injects the tab strip above it.
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
    <>
      <div className="settingsnav">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="settingsnav-item"
            aria-current={pathname.startsWith(tab.href)}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      {children}
    </>
  );
}
