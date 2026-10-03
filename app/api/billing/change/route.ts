import { NextResponse } from "next/server";
import { hasLiveSubscription, overLimits, requireBillingAdmin } from "@/lib/billing/require-billing-admin";
import { paddle, PaddleError } from "@/lib/billing/paddle";
import { priceFor, type Interval } from "@/lib/billing/prices";
import { classifyChange, type PaddleSubscription } from "@/lib/billing/rules";
import { applySubscription } from "@/lib/billing/apply-subscription";
import { planById } from "@/lib/plans";

interface Preview {
  currency_code: string;
  next_billed_at: string | null;
  immediate_transaction: { details: { totals: { grand_total: string } } } | null;
  recurring_transaction_details: { totals: { grand_total: string } } | null;
}

const money = (minor: string | undefined, currency: string) =>
  minor === undefined
    ? null
    : new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(minor) / 100);

// Changing a plan already paid through Paddle (phase39). Decided directly:
// an upgrade charges the prorated difference now; a downgrade, or moving to
// Free (cancelling), waits for the end of the period paid for, and is
// refused while the agency wouldn't fit the smaller plan. `preview` says
// what would happen, without doing it.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    agencyId?: string;
    plan?: string;
    interval?: string;
    preview?: boolean;
  };
  const auth = await requireBillingAdmin(body.agencyId);
  if ("error" in auth) return auth.error;
  const { admin, agency, billing } = auth;

  if (!billing || !hasLiveSubscription(billing)) {
    return NextResponse.json({ error: "Your agency doesn't pay through Paddle yet." }, { status: 409 });
  }
  if (billing.scheduled_plan || billing.cancel_at) {
    return NextResponse.json({ error: "Undo the change that's waiting first." }, { status: 409 });
  }
  const tier = planById(body.plan);
  if (!tier || tier.id === "enterprise") return NextResponse.json({ error: "Choose a plan" }, { status: 400 });
  const subId = billing.paddle_subscription_id!;
  const endsAt = billing.period_ends_at;

  try {
    if (tier.id === "free") {
      const blocked = await overLimits(admin, agency.id, { clients: tier.clients, seats: tier.seats, storageBytes: tier.storageBytes, name: tier.name });
      if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });
      if (body.preview) return NextResponse.json({ kind: "cancel", effectiveAt: endsAt });
      const sub = await paddle<PaddleSubscription>("POST", `/subscriptions/${subId}/cancel`, {
        effective_from: "next_billing_period",
      });
      await applySubscription(admin, sub, null);
      return NextResponse.json({ kind: "cancel", effectiveAt: sub.scheduled_change?.effective_at ?? endsAt });
    }

    const interval: Interval = body.interval === "annual" ? "annual" : "monthly";
    const priceId = priceFor(tier.id, interval);
    if (!priceId) return NextResponse.json({ error: "Choose a plan" }, { status: 400 });
    const change = classifyChange({ plan: agency.plan, interval: billing.billing_interval ?? "monthly" }, { plan: tier.id, interval });
    if (change.kind === "same") return NextResponse.json({ error: "That's your plan already." }, { status: 400 });
    if (change.kind === "ask") {
      return NextResponse.json({ error: "Moving a yearly plan to monthly is arranged by Frank." }, { status: 409 });
    }
    if (change.kind === "downgrade") {
      const blocked = await overLimits(admin, agency.id, { clients: tier.clients, seats: tier.seats, storageBytes: tier.storageBytes, name: tier.name });
      if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });
    }
    const update = {
      items: [{ price_id: priceId, quantity: 1 }],
      // A downgrade isn't billed or credited now: the agency keeps what it
      // paid for, and pays the cheaper price from the next renewal.
      proration_billing_mode: change.kind === "upgrade" ? "prorated_immediately" : "do_not_bill",
    };
    if (body.preview) {
      const p = await paddle<Preview>("PATCH", `/subscriptions/${subId}/preview`, update);
      return NextResponse.json({
        kind: change.kind,
        dueNow: change.kind === "upgrade" ? money(p.immediate_transaction?.details.totals.grand_total ?? "0", p.currency_code) : null,
        recurring: money(p.recurring_transaction_details?.totals.grand_total, p.currency_code),
        nextBilledAt: p.next_billed_at,
        effectiveAt: change.kind === "downgrade" ? endsAt : null,
      });
    }
    const sub = await paddle<PaddleSubscription>("PATCH", `/subscriptions/${subId}`, update);
    const result = await applySubscription(admin, sub, null);
    return NextResponse.json({ kind: change.kind, plan: result.outcome === "applied" ? result.plan : agency.plan });
  } catch (e) {
    const message = e instanceof PaddleError ? e.message : "Couldn't change the plan";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
