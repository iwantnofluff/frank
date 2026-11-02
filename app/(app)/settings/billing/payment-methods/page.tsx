"use client";

import { BillingPage } from "@/components/settings/BillingPage";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useChangeCard, usePaymentMethod, type PaymentMethod } from "@/hooks/use-billing";
import { errorMessage } from "@/lib/errors";

// Settings → Billing → Payment Methods (decided directly, 2 Nov 2026): the
// card on file and changing it, from Frank. The change happens in Paddle's
// own checkout over the page, so the card's number never reaches Frank.
export default function PaymentMethodsPage() {
  return (
    <BillingPage title="Payment Methods" description="How your workspace pays for Frank.">
      <CardOnFile />
    </BillingPage>
  );
}

const BRANDS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  american_express: "American Express",
  discover: "Discover",
  diners_club: "Diners Club",
  jcb: "JCB",
  maestro: "Maestro",
  union_pay: "UnionPay",
};
const METHODS: Record<string, string> = { paypal: "PayPal", apple_pay: "Apple Pay", google_pay: "Google Pay" };

const describe = (m: PaymentMethod) =>
  m.type === "card"
    ? `${m.brand ? (BRANDS[m.brand] ?? m.brand) : "Card"} ending ${m.last4}`
    : (METHODS[m.type] ?? m.type.replace(/_/g, " "));

// Only mounted once BillingPage knows the workspace pays through Paddle.
function CardOnFile() {
  const { data: agency } = useMyAgency();
  const { data, isLoading, error } = usePaymentMethod(agency?.agencyId);
  const change = useChangeCard(agency?.agencyId);

  if (isLoading) return <p className="sub invlist-note">Frank is working…</p>;
  if (error) return <p className="autherr invlist-note">{errorMessage(error, "Couldn't read your payment method")}</p>;
  if (!data?.live) {
    return <p className="sub invlist-note">There&rsquo;s no subscription to pay for, so no card is needed.</p>;
  }
  const m = data.method;
  const key = m ? `${m.last4}${m.expiry}` : null;
  return (
    <>
      {data.pastDue && (
        <p className="autherr invlist-note">
          The last payment didn&rsquo;t go through. Change the card to pay what&rsquo;s owed and carry on.
        </p>
      )}
      <div className="srow">
        <span className="sl">
          <b>{m ? describe(m) : "No card on file"}</b>
          <span>
            {m?.expiry ? `Expires ${m.expiry}` : "Used for each payment"}
            {m?.name ? ` · ${m.name}` : ""}
          </span>
        </span>
        <button type="button" className="btn sm" disabled={change.isPending} onClick={() => change.mutate(key)}>
          {change.isPending ? "Opening…" : data.pastDue ? "Change Card and Pay" : "Change Card"}
        </button>
      </div>
      <p className="sub invlist-note">Paddle, who takes Frank&rsquo;s payments, keeps the card. Frank never sees its number.</p>
      {change.data === "paid" && !change.isPending && <p className="bsaved invlist-note">Card changed.</p>}
      {change.error && <p className="autherr invlist-note">{errorMessage(change.error, "Couldn't change the card")}</p>}
    </>
  );
}
