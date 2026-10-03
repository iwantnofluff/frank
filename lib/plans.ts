// Frank's plans, as the spec sets them (v11 §5, "Subscription plans").
// Prices are USD; annual is billed upfront, per-month shown, 20% off.
// Limits: null means unlimited. Picking a plan applies its limits
// (agencies.client_limit / seat_limit); the platform admin can still
// override one agency's.

export type PlanId = "free" | "starter" | "growth" | "agency" | "enterprise";

export interface Plan {
  id: PlanId;
  name: string;
  monthly: number | null; // null: custom pricing
  annualPerMonth: number | null;
  clients: number | null;
  seats: number | null;
  storage: string;
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
    whiteLabel: "full",
    highlights: ["Full white-label", "Scheduled reports and agency-level analytics"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthly: null,
    annualPerMonth: null,
    clients: null,
    seats: null,
    storage: "Custom",
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
