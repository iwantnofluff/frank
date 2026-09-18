"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings/brand", label: "Branding" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/knowledge", label: "Format directions" },
];

// Each tab's page owns its own .pad + heading, same as every other page in
// the app — this layout only injects the tab strip above it.
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

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
