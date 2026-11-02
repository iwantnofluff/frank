// Frank's plans, as the spec sets them (v11 §5, "Subscription plans").
// Prices are USD; annual is billed upfront, per-month shown, 20% off.
// Limits: null means unlimited. Picking a plan applies its limits
// (agencies.client_limit / seat_limit); the platform admin can still
// override one agency's. plan_limits() in the database keeps the same
// table (phase42, AI allowances phase128) and works each agency's limits
// out from it, so nothing here writes them.

export type PlanId = "free" | "starter" | "growth" | "agency" | "enterprise";

export interface Plan {
  id: PlanId;
  name: string;
  monthly: number | null; // null: custom pricing
  annualPerMonth: number | null;
  clients: number | null;
  seats: number | null;
  storage: string;
  storageBytes: number | null; // null: unlimited (custom)
  aiRequests: number; // a month (phase128)
  whiteLabel: "none" | "partial" | "full";
  highlights: string[];
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    monthly: 0,
    annualPerMonth: null,
    clients: 1,
    seats: 2,
    storage: "500 MB",
    storageBytes: 524288000,
    aiRequests: 30,
    whiteLabel: "none",
    highlights: ["Read-only after the trial", "Review, annotations and approvals"],
  },
  {
    id: "starter",
    name: "Starter",
    monthly: 49,
    annualPerMonth: 39,
    clients: 3,
    seats: 5,
    storage: "5 GB",
    storageBytes: 5368709120,
    aiRequests: 150,
    whiteLabel: "none",
    highlights: ["3 projects per client", "10 versions per post"],
  },
  {
    id: "growth",
    name: "Growth",
    monthly: 149,
    annualPerMonth: 119,
    clients: 10,
    seats: 15,
    storage: "25 GB",
    storageBytes: 26843545600,
    aiRequests: 400,
    whiteLabel: "partial",
    highlights: ["Your logo and colours for clients", "Client-level analytics"],
  },
  {
    id: "agency",
    name: "Agency",
    monthly: 349,
    annualPerMonth: 279,
    clients: 25,
    seats: null,
    storage: "75 GB",
    storageBytes: 80530636800,
    aiRequests: 1000,
    whiteLabel: "full",
    highlights: ["Full white-label", "Scheduled reports and workspace-level analytics"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthly: null,
    annualPerMonth: null,
    clients: null,
    seats: null,
    storage: "Custom",
    storageBytes: null,
    aiRequests: 1000,
    whiteLabel: "full",
    highlights: ["SSO (SAML)", "Custom terms"],
  },
];

export function planById(id: string | null | undefined): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

// "10", or "Unlimited".
export function limitLabel(n: number | null | undefined): string {
  return n === null || n === undefined ? "Unlimited" : String(n);
}

export const PLAN_ORDER: PlanId[] = PLANS.map((p) => p.id);

const rank = (plan: string | null | undefined) => PLAN_ORDER.indexOf((plan ?? "free") as PlanId);

// The spec's white-label rows: logo and colours for clients from Growth;
// a custom address from Agency.
export const brandingAllowed = (plan: string | null | undefined) => rank(plan) >= rank("growth");
export const customAddressAllowed = (plan: string | null | undefined) => rank(plan) >= rank("agency");

// Free is a 30-day trial; after it, read-only until a paid plan (phase41,
// agency_read_only() in the database is what actually enforces it).
export function isReadOnly(plan: string | null | undefined, trialEndsAt: string | null | undefined, now = Date.now()) {
  return plan === "free" && (!trialEndsAt || new Date(trialEndsAt).getTime() <= now);
}

// "1.2 GB", "340 MB".
export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return "Unlimited";
  if (n >= 1024 ** 3) return `${+(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  return `${Math.max(0, Math.round(n / 1024))} KB`;
}

// Why an upload of `bytes` wouldn't fit the plan's storage, or null if it
// would (phase41: asked before uploading; the database enforces it).
export function storageProblem(used: number, limit: number | null, bytes: number): string | null {
  if (limit === null || used + bytes <= limit) return null;
  return `This file needs ${formatBytes(bytes)}, and your plan's ${formatBytes(limit)} of storage has ${formatBytes(Math.max(0, limit - used))} left. Delete files you no longer need, or move to a bigger plan.`;
}
