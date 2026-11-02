"use client";

import Link from "next/link";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { useBilling } from "@/hooks/use-billing";
import { SettingsHead } from "./SettingsHead";
import { planById } from "@/lib/plans";
import { seesAllClients } from "@/lib/roles";

const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

// Settings → Billing (phase39). Paddle keeps the invoices and the card;
// each page shows them from Frank (decided directly, 2 Nov 2026: no link to
// Paddle's portal). An agency that doesn't pay through Paddle is told who it
// arranges billing with instead.
export function BillingPage({
  title,
  description,
  overview = false,
  children,
}: {
  title: string;
  description: string;
  overview?: boolean;
  // The page's own part, once the workspace pays through Paddle.
  children?: React.ReactNode;
}) {
  const { data: agency } = useMyAgency();
  const { data: me } = useMyMembership(agency?.agencyId);
  const { data: billing, isLoading } = useBilling(agency?.agencyId);
  const isAdmin = me?.client_id === null && seesAllClients(me?.role);
  const plan = planById(agency?.plan);
  const live = !!billing?.paddle_subscription_id && billing.status !== "canceled";

  let body: React.ReactNode;
  if (me && !isAdmin) {
    body = <p className="sub">Only Admins and Owners can see billing.</p>;
  } else if (!agency || isLoading) {
    body = null;
  } else if (!billing?.paddle_customer_id) {
    body =
      agency.plan === "free" ? (
        <p className="sub">
          {agency.name} is on Free, so there&rsquo;s nothing to pay. <Link href="/settings/billing/plans">See the plans</Link>.
        </p>
      ) : (
        <p className="sub">{agency.name}&rsquo;s plan is arranged with Frank, who sends its invoices directly.</p>
      );
  } else {
    body = (
      <>
        {overview && (
          <>
            <div className="srow">
              <span className="sl">
                <b>Plan</b>
                <span>{live ? `Billed ${billing.billing_interval === "annual" ? "yearly" : "monthly"}` : "No paid plan"}</span>
              </span>
              <span className="planval">
                {plan?.name}
                <Link className="btn sm" href="/settings/billing/plans">
                  Change
                </Link>
              </span>
            </div>
            {live && (
              <div className="srow">
                <span className="sl">
                  <b>{billing.cancel_at ? "Ends" : "Next payment"}</b>
                  <span>
                    {billing.cancel_at
                      ? "Then moves to Free"
                      : billing.scheduled_plan
                        ? `Moves to ${planById(billing.scheduled_plan)?.name} then`
                        : billing.status === "past_due"
                          ? (
                            <>
                              The last payment didn&rsquo;t go through.{" "}
                              <Link href="/settings/billing/payment-methods">Change the card</Link>
                            </>
                          )
                          : "Charged to the card on file"}
                  </span>
                </span>
                <span>{day(billing.cancel_at ?? billing.period_ends_at)}</span>
              </div>
            )}
          </>
        )}
        {children}
      </>
    );
  }

  return (
    <div className="pad" style={{ maxWidth: 760 }}>
      <SettingsHead title={title} description={description} />
      <div className="panel">{body}</div>
    </div>
  );
}
