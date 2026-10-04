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
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    key: "general",
    label: "General",
    pages: [
      { href: "/settings/general/account-name", label: "Account Name" },
      { href: "/settings/general/account-url", label: "Account URL" },
      // What Frank's support has done in the account (phase51), for Owners.
      { href: "/settings/general/support-activity", label: "Support Activity" },
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
    key: "ai",
    label: "AI Governance",
    pages: [
      { href: "/settings/ai/credit-usage", label: "Credit Usage", soon: true },
      { href: "/settings/ai/drafting-model", label: "Drafting Model" },
    ],
  },
  {
    key: "connections",
    label: "Connections",
    pages: [{ href: "/settings/connections/apis", label: "APIs", soon: true }],
  },
  {
    key: "plan",
    label: "Your Plan",
    pages: [{ href: "/settings/plan/plans", label: "Plans" }],
  },
  {
    key: "billing",
    label: "Billing",
    pages: [
      { href: "/settings/billing/overview", label: "Overview" },
      { href: "/settings/billing/invoice-settings", label: "Invoice Settings", soon: true },
      { href: "/settings/billing/invoices", label: "Invoices" },
      { href: "/settings/billing/payment-methods", label: "Payment Methods" },
    ],
  },
  {
    key: "knowledge",
    label: "Knowledge",
    pages: [
      { href: "/settings/knowledge/format-directions", label: "Format Directions" },
      { href: "/settings/knowledge/reference-material", label: "Reference Material" },
    ],
  },
];

export const FIRST_SETTINGS_PAGE = SETTINGS_SECTIONS[0].pages[0].href;

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
