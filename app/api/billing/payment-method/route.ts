import { NextResponse } from "next/server";
import { hasLiveSubscription, requireBillingAdmin } from "@/lib/billing/require-billing-admin";
import { paddle, PaddleError } from "@/lib/billing/paddle";

interface Payment {
  status: string;
  method_details: {
    type: string;
    card: { type: string; last4: string; expiry_month: number; expiry_year: number; cardholder_name: string | null } | null;
  } | null;
}
interface Transaction {
  id: string;
  payments: Payment[];
}

// Settings → Billing → Payment Methods (decided directly, 2 Nov 2026): the
// card the workspace pays with, and changing it, all in Frank. Paddle keeps
// the card; Frank never sees its number. The card shown is the one the last
// successful payment used (Paddle's transactions, so no extra permission),
// which a card change updates, since Paddle makes that a payment of its own.
// Admins and Owners only (requireBillingAdmin).
export async function GET(request: Request) {
  const agencyId = new URL(request.url).searchParams.get("agencyId") ?? undefined;
  const auth = await requireBillingAdmin(agencyId);
  if (auth.error) return auth.error;
  const { billing } = auth;
  if (!billing?.paddle_customer_id || !hasLiveSubscription(billing)) return NextResponse.json({ live: false });
  try {
    const recent = await paddle<Transaction[]>(
      "GET",
      `/transactions?customer_id=${billing.paddle_customer_id}&status=paid,completed&order_by=created_at[DESC]&per_page=20`,
    );
    // A card change is a $0 payment Paddle leaves "authorized", not captured.
    const used = recent
      .flatMap((t) => t.payments)
      .find((p) => (p.status === "captured" || p.status === "authorized") && p.method_details);
    const m = used?.method_details;
    return NextResponse.json({
      live: true,
      pastDue: billing.status === "past_due",
      method: m
        ? {
            type: m.type,
            brand: m.card?.type ?? null,
            last4: m.card?.last4 ?? null,
            expiry: m.card ? `${String(m.card.expiry_month).padStart(2, "0")}/${m.card.expiry_year}` : null,
            name: m.card?.cardholder_name ?? null,
          }
        : null,
    });
  } catch (e) {
    const message = e instanceof PaddleError ? e.message : "Couldn't read your payment method";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

// Changing the card: Paddle's own transaction for it, which Paddle's
// checkout then opens. For a subscription whose last payment failed, the
// same transaction pays what's owed.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { agencyId?: string };
  const auth = await requireBillingAdmin(body.agencyId);
  if (auth.error) return auth.error;
  const { billing } = auth;
  if (!billing || !hasLiveSubscription(billing)) {
    return NextResponse.json({ error: "Your workspace isn't paying through Paddle." }, { status: 409 });
  }
  try {
    const txn = await paddle<{ id: string }>("GET", `/subscriptions/${billing.paddle_subscription_id}/update-payment-method-transaction`);
    return NextResponse.json({ transactionId: txn.id });
  } catch (e) {
    const message = e instanceof PaddleError ? e.message : "Couldn't start changing the card";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
