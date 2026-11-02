import { NextResponse } from "next/server";
import { hasLiveSubscription, requireBillingAdmin } from "@/lib/billing/require-billing-admin";
import { paddle, PaddleError } from "@/lib/billing/paddle";
import { cleanInvoiceDetails, paddleFieldMessage, type InvoiceDetails } from "@/lib/billing/invoice-details";

interface Customer {
  name: string | null;
  email: string;
}
interface Address {
  id: string;
  first_line: string | null;
  second_line: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country_code: string;
}
interface Business {
  id: string;
  name: string;
  tax_identifier: string | null;
}
interface Subscription {
  address_id: string;
  business_id: string | null;
}

// Invoice Settings (decided directly, 2 Nov 2026): the details on a
// workspace's invoices, read from and saved to Paddle, which prints them.
// Only for a workspace with a live subscription, since that's what the next
// invoice comes from. Admins and Owners only (requireBillingAdmin).
async function load(agencyId: string | undefined) {
  const auth = await requireBillingAdmin(agencyId);
  if (auth.error) return { error: auth.error } as const;
  const { billing } = auth;
  if (!billing?.paddle_customer_id || !hasLiveSubscription(billing)) return { live: false } as const;
  const customerId = billing.paddle_customer_id;
  const [customer, sub] = await Promise.all([
    paddle<Customer>("GET", `/customers/${customerId}`),
    paddle<Subscription>("GET", `/subscriptions/${billing.paddle_subscription_id}`),
  ]);
  const [address, business] = await Promise.all([
    paddle<Address>("GET", `/customers/${customerId}/addresses/${sub.address_id}`),
    sub.business_id ? paddle<Business>("GET", `/customers/${customerId}/businesses/${sub.business_id}`) : null,
  ]);
  return { live: true, customerId, subscriptionId: billing.paddle_subscription_id!, customer, sub, address, business } as const;
}

function toDetails(customer: Customer, address: Address, business: Business | null): InvoiceDetails {
  return {
    contactName: customer.name ?? "",
    companyName: business?.name ?? "",
    taxNumber: business?.tax_identifier ?? "",
    firstLine: address.first_line ?? "",
    secondLine: address.second_line ?? "",
    city: address.city ?? "",
    region: address.region ?? "",
    postalCode: address.postal_code ?? "",
    countryCode: address.country_code,
  };
}

function failed(e: unknown, fallback: string) {
  if (e instanceof PaddleError) {
    const message = paddleFieldMessage(e.fields) ?? e.message;
    return NextResponse.json({ error: message }, { status: e.status === 400 ? 400 : 502 });
  }
  return NextResponse.json({ error: fallback }, { status: 502 });
}

export async function GET(request: Request) {
  const agencyId = new URL(request.url).searchParams.get("agencyId") ?? undefined;
  try {
    const got = await load(agencyId);
    if ("error" in got) return got.error;
    if (!got.live) return NextResponse.json({ live: false });
    return NextResponse.json({ live: true, email: got.customer.email, details: toDetails(got.customer, got.address, got.business) });
  } catch (e) {
    return failed(e, "Couldn't read your invoice details from Paddle");
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { agencyId?: string; details?: unknown };
  const orNull = (s: string) => s || null;
  try {
    const got = await load(body.agencyId);
    if ("error" in got) return got.error;
    if (!got.live) return NextResponse.json({ error: "Your workspace isn't paying through Paddle, so there are no invoices to set up." }, { status: 409 });
    const cleaned = cleanInvoiceDetails(body.details);
    if ("error" in cleaned) return NextResponse.json({ error: cleaned.error }, { status: 400 });
    const d = cleaned.details;
    const { customerId, subscriptionId, sub } = got;

    // The parts Paddle is likeliest to refuse go first (the tax number, the
    // address), so a refusal usually leaves nothing half-saved.
    // Paddle checks a tax number's shape (letters, digits, length), not that
    // it's real; that's as far as the check goes.
    let business = got.business;
    if (d.companyName) {
      const fields = { name: d.companyName, tax_identifier: orNull(d.taxNumber) };
      if (sub.business_id) {
        business = await paddle<Business>("PATCH", `/customers/${customerId}/businesses/${sub.business_id}`, fields);
      } else {
        business = await paddle<Business>("POST", `/customers/${customerId}/businesses`, fields);
        await paddle("PATCH", `/subscriptions/${subscriptionId}`, { business_id: business.id });
      }
    } else if (sub.business_id) {
      // No company: invoices go to the contact alone.
      await paddle("PATCH", `/subscriptions/${subscriptionId}`, { business_id: null });
      business = null;
    }
    const address = await paddle<Address>("PATCH", `/customers/${customerId}/addresses/${sub.address_id}`, {
      first_line: orNull(d.firstLine),
      second_line: orNull(d.secondLine),
      city: orNull(d.city),
      region: orNull(d.region),
      postal_code: orNull(d.postalCode),
      country_code: d.countryCode,
    });
    const customer = await paddle<Customer>("PATCH", `/customers/${customerId}`, { name: orNull(d.contactName) });
    return NextResponse.json({ live: true, email: customer.email, details: toDetails(customer, address, business) });
  } catch (e) {
    return failed(e, "Couldn't save your invoice details to Paddle");
  }
}
