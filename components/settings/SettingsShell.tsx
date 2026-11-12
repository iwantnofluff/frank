"use client";

import { usePathname } from "next/navigation";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { SettingsMain } from "@/components/settings/SettingsMain";
import { SettingsClose } from "@/components/settings/SettingsClose";

// Settings' frame: the left menu of sections and pages (lib/settings-nav.ts)
// beside the page you're on, which owns its own .pad and heading. Who may
// see it is decided on the server, in app/(app)/settings/layout.tsx.
export function SettingsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="setwrap">
      <SettingsNav pathname={pathname} />
      <div className="review-sep" aria-hidden="true" />
      <SettingsMain>{children}</SettingsMain>
      <SettingsClose fallback="/dashboard" label="Close Workspace Settings" />
    </div>
  );
}
