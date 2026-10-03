import { NextResponse } from "next/server";
import { hasLiveSubscription, requireBillingAdmin } from "@/lib/billing/require-billing-admin";
import { paddle, PaddleError } from "@/lib/billing/paddle";
import { priceFor } from "@/lib/billing/prices";
import type { PaddleSubscription } from "@/lib/billing/rules";
import { applySubscription } from "@/lib/billing/apply-subscription";
import type { PlanId } from "@/lib/plans";

// Keeping the plan after all (phase39): drops a cancellation, or a
// downgrade, that's waiting for the end of the period. Nothing is billed —
// the period was paid for at the plan being kept.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { agencyId?: string };
  const auth = await requireBillingAdmin(body.agencyId);
  if ("error" in auth) return auth.error;
  const { admin, agency, billing } = auth;
  if (!billing || !hasLiveSubscription(billing) || (!billing.cancel_at && !billing.scheduled_plan)) {
    return NextResponse.json({ error: "There's nothing waiting to undo." }, { status: 409 });
  }
  const subId = billing.paddle_subscription_id!;
  try {
    let sub: PaddleSubscription;
    if (billing.cancel_at) {
      sub = await paddle<PaddleSubscription>("PATCH", `/subscriptions/${subId}`, { scheduled_change: null });
    } else {
      const priceId = priceFor(agency.plan as PlanId, billing.billing_interval ?? "monthly");
      if (!priceId) return NextResponse.json({ error: "Couldn't find your plan's price" }, { status: 500 });
      sub = await paddle<PaddleSubscription>("PATCH", `/subscriptions/${subId}`, {
        items: [{ price_id: priceId, quantity: 1 }],
        proration_billing_mode: "do_not_bill",
      });
    }
    await applySubscription(admin, sub, null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof PaddleError ? e.message : "Couldn't undo the change";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
