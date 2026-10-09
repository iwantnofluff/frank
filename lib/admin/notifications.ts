// The emails Frank sends its platform admins, each of which an admin can
// switch off (Admin → Settings → Notifications). Kept on the admin's own
// account (Supabase app_metadata, which only the service role can write),
// so it needs no table. Everything is on until switched off.
export const ADMIN_NOTIFICATIONS = [
  { key: "signups", label: "New sign-ups", hint: "A workspace signs itself up at beingfrank.app." },
  { key: "plan_changes", label: "Plan changes", hint: "A workspace moves plan through Paddle: upgrades, downgrades, cancelling." },
  { key: "requests", label: "Requests to Frank", hint: "A workspace asks for Enterprise, or for a change Frank arranges." },
  { key: "billing_problems", label: "Billing problems", hint: "Something in Paddle needs sorting by hand, like two subscriptions for one workspace." },
] as const;

export type AdminNotification = (typeof ADMIN_NOTIFICATIONS)[number]["key"];
export type AdminNotificationPrefs = Partial<Record<AdminNotification, boolean>>;

export const wantsNotification = (prefs: AdminNotificationPrefs | undefined, kind: AdminNotification) =>
  prefs?.[kind] !== false;
