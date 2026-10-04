import type { SettingsSection } from "@/lib/settings-nav";

// The admin area's left menu (direct instruction): the same collapsing menu
// as the app's Settings (SettingsNav).
export const ADMIN_SECTIONS: SettingsSection[] = [
  { key: "dashboard", label: "Dashboard", pages: [
      { href: "/admin", label: "Agencies" },
      // Everyone on Frank, view-only (decided directly, 4 Oct 2026).
      { href: "/admin/users", label: "Users" },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    pages: [
      { href: "/admin/settings/notifications", label: "Notifications" },
      { href: "/admin/settings/security", label: "Password & Security" },
    ],
  },
];
