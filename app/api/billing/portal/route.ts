import { NextResponse } from "next/server";
import { requireBillingAdmin } from "@/lib/billing/require-billing-admin";
import { paddle, PaddleError } from "@/lib/billing/paddle";

// Paddle's customer portal (phase39): invoices, the card on file, and the
// billing details on invoices. A fresh, short-lived link each time.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { agencyId?: string };
  const auth = await requireBillingAdmin(body.agencyId);
  if ("error" in auth) return auth.error;
  const { billing } = auth;
  if (!billing?.paddle_customer_id) {
    return NextResponse.json({ error: "Your workspace hasn't paid through Paddle yet." }, { status: 409 });
  }
  try {
    const session = await paddle<{ urls: { general: { overview: string } } }>(
      "POST",
      `/customers/${billing.paddle_customer_id}/portal-sessions`,
      billing.paddle_subscription_id ? { subscription_ids: [billing.paddle_subscription_id] } : {},
    );
    return NextResponse.json({ url: session.urls.general.overview });
  } catch (e) {
    const message = e instanceof PaddleError ? e.message : "Couldn't open billing";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
