import { PLAN_ORDER, type PlanId } from "../plans.ts";
import type { Interval } from "./prices.ts";

// What paying through Paddle does, as plain functions (phase39). Decided
// directly: an upgrade charges the prorated difference straight away; a
// downgrade waits for the end of the period paid for; cancelling drops to
// Free at that point.

export const planRank = (plan: string) => PLAN_ORDER.indexOf(plan as PlanId);

export type Change =
  | { kind: "same" }
  // Charged the prorated difference now; the new plan starts now.
  | { kind: "upgrade" }
  // No charge or credit now; the agency keeps what it paid for until the
  // period ends, then pays the cheaper price.
  | { kind: "downgrade" }
  // Yearly to monthly: Paddle only changes billing frequency straight away,
  // which would cut short a year already paid for. Frank arranges it.
  | { kind: "ask" };

export function classifyChange(from: { plan: string; interval: Interval }, to: { plan: string; interval: Interval }): Change {
  if (from.plan === to.plan && from.interval === to.interval) return { kind: "same" };
  if (from.interval === "annual" && to.interval === "monthly") return { kind: "ask" };
  // Monthly to yearly is a new, longer period: billed now, like an upgrade.
  if (from.interval === "monthly" && to.interval === "annual") return { kind: "upgrade" };
  return planRank(to.plan) > planRank(from.plan) ? { kind: "upgrade" } : { kind: "downgrade" };
}

// Paddle's subscription, as much of it as Frank reads.
export interface PaddleSubscription {
  id: string;
  status: string;
  customer_id: string;
  items: { price: { id: string } }[];
  current_billing_period: { starts_at: string; ends_at: string } | null;
  scheduled_change: { action: string; effective_at: string } | null;
  custom_data: Record<string, unknown> | null;
}

export interface BillingRow {
  agency_id: string;
  paddle_customer_id: string | null;
  paddle_subscription_id: string | null;
  status: string | null;
  billing_interval: Interval | null;
  period_starts_at: string | null;
  period_ends_at: string | null;
  scheduled_plan: PlanId | null;
  cancel_at: string | null;
  last_event_at: string | null;
}

const sameInstant = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && new Date(a).getTime() === new Date(b).getTime();

// Given Paddle's subscription and what Frank had, what the agency can use
// now and what's waiting. `subscribed` is the subscription's own price.
export function nextBillingState(
  sub: PaddleSubscription,
  subscribed: { plan: PlanId; interval: Interval },
  prev: BillingRow | null,
  currentPlan: string,
): { plan: PlanId; row: Omit<BillingRow, "agency_id" | "last_event_at"> } {
  const base = {
    paddle_customer_id: sub.customer_id,
    paddle_subscription_id: sub.id,
    status: sub.status,
  };
  if (sub.status === "canceled") {
    return {
      plan: "free",
      row: {
        ...base,
        billing_interval: null,
        period_starts_at: null,
        period_ends_at: null,
        scheduled_plan: null,
        cancel_at: null,
      },
    };
  }
  const period = sub.current_billing_period;
  // Same subscription, same period: a cheaper price set during it doesn't
  // take anything away until the period ends.
  const samePeriod =
    !!prev && prev.paddle_subscription_id === sub.id && sameInstant(prev.period_starts_at, period?.starts_at);
  const waiting = samePeriod && planRank(subscribed.plan) < planRank(currentPlan);
  return {
    plan: waiting ? (currentPlan as PlanId) : subscribed.plan,
    row: {
      ...base,
      billing_interval: waiting ? prev!.billing_interval : subscribed.interval,
      period_starts_at: period?.starts_at ?? null,
      period_ends_at: period?.ends_at ?? null,
      scheduled_plan: waiting ? subscribed.plan : null,
      cancel_at: sub.scheduled_change?.action === "cancel" ? sub.scheduled_change.effective_at : null,
    },
  };
}
