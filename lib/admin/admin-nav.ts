import type { SettingsSection } from "@/lib/settings-nav";

// The admin area's left menu (direct instruction): the same collapsing menu
// as the app's Settings (SettingsNav).
export const ADMIN_SECTIONS: SettingsSection[] = [
  { key: "dashboard", label: "Dashboard", pages: [
      // How Frank is doing, and who needs a look (decided directly).
      { href: "/admin", label: "Overview" },
      { href: "/admin/agencies", label: "Workspaces" },
      // Everyone on Frank, view-only (decided directly, 4 Oct 2026).
      { href: "/admin/users", label: "Users" },
    ],
  },
  {
    // Notes on running Frank (direct instruction, 2 Nov 2026).
    key: "guide",
    label: "Guide",
    pages: [
      { href: "/admin/guide/costs", label: "Costs and Monitoring" },
      { href: "/admin/guide/launch", label: "Launch Checklist" },
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
