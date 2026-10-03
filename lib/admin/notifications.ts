// The emails Frank sends its platform admins, each of which an admin can
// switch off (Admin → Settings → Notifications). Kept on the admin's own
// account (Supabase app_metadata, which only the service role can write),
// so it needs no table. Everything is on until switched off.
export const ADMIN_NOTIFICATIONS = [
  { key: "signups", label: "New sign-ups", hint: "An agency signs itself up at beingfrank.app." },
  { key: "plan_changes", label: "Plan changes", hint: "An agency moves plan through Paddle: upgrades, downgrades, cancelling." },
  { key: "requests", label: "Requests to Frank", hint: "An agency asks for Enterprise, or for a change Frank arranges." },
  { key: "billing_problems", label: "Billing problems", hint: "Something in Paddle needs sorting by hand, like two subscriptions for one agency." },
] as const;

export type AdminNotification = (typeof ADMIN_NOTIFICATIONS)[number]["key"];
export type AdminNotificationPrefs = Partial<Record<AdminNotification, boolean>>;

export const wantsNotification = (prefs: AdminNotificationPrefs | undefined, kind: AdminNotification) =>
  prefs?.[kind] !== false;
