"use client";

import { usePathname } from "next/navigation";
import { useIsStaff } from "@/hooks/use-is-staff";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { SettingsMain } from "@/components/settings/SettingsMain";
import type { SettingsSection } from "@/lib/settings-nav";

// My Profile in Settings' layout (direct instruction): its left menu beside
// the page you're on. Notifications (tips, phase116) is the team's only.
export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isStaff, isPending } = useIsStaff();
  const sections: SettingsSection[] = [
    {
      key: "me",
      label: "My Profile",
      pages: [
        { href: "/profile", label: "Profile" },
        ...(isStaff && !isPending ? [{ href: "/profile/notifications", label: "Notifications" }] : []),
      ],
    },
  ];
  return (
    <div className="setwrap">
      <SettingsNav pathname={pathname} sections={sections} label="My Profile sections" />
      <div className="review-sep" aria-hidden="true" />
      <SettingsMain>{children}</SettingsMain>
    </div>
  );
}
