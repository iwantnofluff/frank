import type { SettingsSection } from "@/lib/settings-nav";

// Client Settings' menu (direct instruction): the same structure as
// Settings, for one client, each section with its supplied icon (so the
// menu folds to icons), opened from the rail's Client Settings icon.
// Staff see every page; a client's own people see their Knowledge only,
// read only.
export function clientSettingsSections(clientId: string, staff: boolean): SettingsSection[] {
  const base = `/clients/${clientId}/settings`;
  const knowledge: SettingsSection = {
    key: "knowledge",
    label: "Knowledge",
    icon: "suitcase",
    // "Discovery" (direct instruction): what's been learnt about the client.
    pages: [
      { href: `${base}/knowledge`, label: "Discovery" },
      // Each month's decided strategy, which drafting follows (phase78).
      { href: `${base}/strategy`, label: "Strategy" },
    ],
  };
  if (!staff) return [knowledge];
  return [
    {
      key: "client",
      // "Profile" and "About" (direct instruction; were Client and Client Details).
      label: "Profile",
      icon: "buildings",
      pages: [
        { href: `${base}/details`, label: "About" },
        { href: `${base}/people`, label: "People" },
        // How Frank works for this client (phase70).
        { href: `${base}/preferences`, label: "Preferences" },
      ],
    },
    knowledge,
    {
      key: "connections",
      label: "Connections",
      icon: "link",
      pages: [{ href: `${base}/instagram`, label: "Instagram" }],
    },
  ];
}

// The pages a client's own people may open.
export const clientOnlyPage = (pathname: string) => /\/settings\/(knowledge|strategy)\/?$/.test(pathname);
