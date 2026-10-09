import { NextResponse } from "next/server";
import { hasLiveSubscription, requireBillingAdmin } from "@/lib/billing/require-billing-admin";
import { paddle, PaddleError } from "@/lib/billing/paddle";
import { priceFor, type Interval } from "@/lib/billing/prices";
import { planById } from "@/lib/plans";

// Starting to pay (phase39): an agency not yet paying by card — on Free, or
// on a plan Frank set by hand (decided directly, revised 3 Oct 2026) — picks
// a paid plan. Frank makes the Paddle transaction here, naming the agency,
// so the browser can't say whose plan it is; Paddle's checkout then takes
// the card, and the webhook moves the plan once it's paid.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { agencyId?: string; plan?: string; interval?: string };
  const auth = await requireBillingAdmin(body.agencyId);
  if ("error" in auth) return auth.error;
  const { agency, billing, user } = auth;

  const tier = planById(body.plan);
  const interval: Interval = body.interval === "annual" ? "annual" : "monthly";
  const priceId = tier ? priceFor(tier.id, interval) : null;
  if (!tier || !priceId) return NextResponse.json({ error: "Choose a paid plan" }, { status: 400 });
  if (hasLiveSubscription(billing)) {
    return NextResponse.json({ error: "Your workspace already pays through Paddle — change the plan instead." }, { status: 409 });
  }

  try {
    const txn = await paddle<{ id: string }>("POST", "/transactions", {
      items: [{ price_id: priceId, quantity: 1 }],
      custom_data: { agency_id: agency.id },
      ...(billing?.paddle_customer_id ? { customer_id: billing.paddle_customer_id } : {}),
    });
    return NextResponse.json({ transactionId: txn.id, email: billing?.paddle_customer_id ? null : user.email });
  } catch (e) {
    const message = e instanceof PaddleError ? e.message : "Couldn't start the checkout";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
