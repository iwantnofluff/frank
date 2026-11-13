import type { NavIconKey } from "@/lib/nav-icons";

// Settings' sections and pages, in menu order (direct instruction — a
// monday-style admin layout). Each page has its own address; "soon" pages
// are in the menu, marked Coming soon, until they're built.
export interface SettingsPage {
  href: string;
  label: string;
  soon?: boolean;
}
export interface SettingsSection {
  key: string;
  label: string;
  pages: SettingsPage[];
  // A menu whose every section has one folds to icons (SettingsNav).
  icon?: NavIconKey;
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    key: "general",
    label: "General",
    pages: [
      // Workspace, not Account (direct instruction); the addresses stay.
      { href: "/settings/general/account-name", label: "Workspace Name" },
      { href: "/settings/general/account-url", label: "Workspace URL" },
      // How long read notifications are kept (phase90) and how far back
      // review links list Approved posts (phase92).
      { href: "/settings/general/preferences", label: "Preferences" },
      // The statuses within each stage (phase151), every client's unless
      // it has its own.
      { href: "/settings/general/statuses", label: "Statuses" },
      // What Frank's support has done in the account (phase51), for Owners.
      { href: "/settings/general/support-activity", label: "Support Activity" },
      // Every version of Frank and what changed (direct instruction).
      { href: "/settings/general/updates", label: "Updates" },
    ],
  },
  {
    key: "customisation",
    label: "Customisation",
    pages: [
      { href: "/settings/customisation/logo", label: "Logo" },
      { href: "/settings/customisation/brand-colours", label: "Brand Colours" },
    ],
  },
  {
    key: "team",
    label: "Team",
    pages: [
      { href: "/settings/team/users", label: "Users" },
      { href: "/settings/team/clients", label: "Clients" },
    ],
  },
  {
    key: "knowledge",
    label: "Knowledge",
    pages: [
      // The rules Frank proofreads by (phase122), above the formats.
      { href: "/settings/knowledge/proofreading", label: "Proofreading" },
      { href: "/settings/knowledge/format-directions", label: "Format Directions" },
      { href: "/settings/knowledge/reference-material", label: "Reference Material" },
    ],
  },
  {
    key: "ai",
    label: "AI Governance",
    pages: [
      { href: "/settings/ai/credit-usage", label: "Credit Usage" },
      { href: "/settings/ai/drafting-model", label: "Drafting Model" },
    ],
  },
  {
    key: "connections",
    label: "Connections",
    // A client's Instagram, for the live feed (phase54).
    // And the workspace's Slack, for each project's channel (phase154).
    pages: [
      { href: "/settings/connections/instagram", label: "Instagram" },
      { href: "/settings/connections/slack", label: "Slack" },
    ],
  },
  {
    // How the work moves from concept to approval (phase71), for Owners and
    // Admins; to become the homepage later.
    key: "analytics",
    label: "Analytics",
    pages: [{ href: "/settings/analytics", label: "Analytics" }],
  },
  {
    // Last (direct instruction, 2 Nov 2026).
    key: "billing",
    label: "Billing",
    pages: [
      { href: "/settings/billing/overview", label: "Overview" },
      // Its own Your Plan section until 2 Nov 2026 (direct instruction).
      { href: "/settings/billing/plans", label: "Plans" },
      { href: "/settings/billing/invoice-settings", label: "Invoice Settings" },
      { href: "/settings/billing/invoices", label: "Invoices" },
      { href: "/settings/billing/payment-methods", label: "Payment Methods" },
    ],
  },
];

export const FIRST_SETTINGS_PAGE = SETTINGS_SECTIONS[0].pages[0].href;

// Frank's own team's workspace (No Fluff, who build Frank): its Primary
// Owner gets a link to Frank Admin in the account menu (decided directly,
// 2 Nov 2026; hooks/use-frank-admin-link.ts).
export const FRANK_HOME_SUBDOMAIN = "nofluff";

// The page a path is on: the longest address that matches, so /admin
// (Agencies) doesn't swallow /admin/settings/... in the admin area's menu.
export function settingsPageFor(pathname: string, sections: SettingsSection[] = SETTINGS_SECTIONS) {
  let best: { section: SettingsSection; page: SettingsPage } | null = null;
  for (const section of sections) {
    for (const page of section.pages) {
      const hit = pathname === page.href || pathname.startsWith(`${page.href}/`);
      if (hit && (!best || page.href.length > best.page.href.length)) best = { section, page };
    }
  }
  return best;
}
