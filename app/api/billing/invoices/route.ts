import { NextResponse } from "next/server";
import { requireBillingAdmin } from "@/lib/billing/require-billing-admin";
import { paddle, PaddleError } from "@/lib/billing/paddle";

interface Transaction {
  id: string;
  customer_id: string;
  status: string;
  invoice_number: string | null;
  billed_at: string | null;
  currency_code: string;
  details: { totals: { grand_total: string } };
}

// Settings → Billing → Invoices (decided directly, 2 Nov 2026): the
// workspace's invoices listed in Frank, each PDF downloaded through Paddle,
// which keeps them. Admins and Owners only (requireBillingAdmin). A
// transaction is only ever looked up for the workspace's own Paddle
// customer, so another workspace's invoice can't be fetched by its id.
const INVOICED = "billed,paid,completed,past_due";

export async function GET(request: Request) {
  const agencyId = new URL(request.url).searchParams.get("agencyId") ?? undefined;
  const auth = await requireBillingAdmin(agencyId);
  if (auth.error) return auth.error;
  const customerId = auth.billing?.paddle_customer_id;
  if (!customerId) return NextResponse.json({ invoices: [] });
  try {
    const all: Transaction[] = [];
    let after: string | null = null;
    // Paddle pages by 50; a workspace's few years of invoices fit in a few.
    for (let i = 0; i < 10; i++) {
      const page: Transaction[] = await paddle<Transaction[]>(
        "GET",
        `/transactions?customer_id=${customerId}&status=${INVOICED}&order_by=billed_at[DESC]&per_page=50${after ? `&after=${after}` : ""}`,
      );
      all.push(...page);
      if (page.length < 50) break;
      after = page[page.length - 1].id;
    }
    return NextResponse.json({
      invoices: all
        .filter((t) => t.invoice_number)
        .map((t) => ({
          id: t.id,
          number: t.invoice_number,
          billedAt: t.billed_at,
          total: t.details.totals.grand_total,
          currency: t.currency_code,
          status: t.status === "billed" ? "due" : t.status === "past_due" ? "overdue" : "paid",
        })),
    });
  } catch (e) {
    const message = e instanceof PaddleError ? e.message : "Couldn't read your invoices";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

// A fresh link to one invoice's PDF (Paddle's links last a short while).
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { agencyId?: string; transactionId?: string };
  const auth = await requireBillingAdmin(body.agencyId);
  if (auth.error) return auth.error;
  const customerId = auth.billing?.paddle_customer_id;
  if (!customerId || !body.transactionId || !/^txn_[a-z0-9]+$/.test(body.transactionId)) {
    return NextResponse.json({ error: "No such invoice" }, { status: 404 });
  }
  try {
    const t = await paddle<Transaction>("GET", `/transactions/${body.transactionId}`);
    if (t.customer_id !== customerId || !t.invoice_number) {
      return NextResponse.json({ error: "No such invoice" }, { status: 404 });
    }
    const { url } = await paddle<{ url: string }>("GET", `/transactions/${t.id}/invoice`);
    return NextResponse.json({ url });
  } catch (e) {
    if (e instanceof PaddleError && e.status === 404) return NextResponse.json({ error: "No such invoice" }, { status: 404 });
    const message = e instanceof PaddleError ? e.message : "Couldn't get the invoice";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
