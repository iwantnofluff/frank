"use client";

import Link from "next/link";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { useBilling, useOpenBillingPortal } from "@/hooks/use-billing";
import { SettingsHead } from "./SettingsHead";
import { planById } from "@/lib/plans";
import { seesAllClients } from "@/lib/roles";
import { errorMessage } from "@/lib/errors";

const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

// Settings → Billing (phase39). Paddle keeps the invoices and the card, so
// these pages say where things stand and open Paddle's customer portal for
// the rest. An agency that doesn't pay through Paddle is told who it
// arranges billing with instead.
export function BillingPage({
  title,
  description,
  portalLabel,
  portalNote,
  overview = false,
}: {
  title: string;
  description: string;
  portalLabel: string;
  portalNote: string;
  overview?: boolean;
}) {
  const { data: agency } = useMyAgency();
  const { data: me } = useMyMembership(agency?.agencyId);
  const { data: billing, isLoading } = useBilling(agency?.agencyId);
  const portal = useOpenBillingPortal(agency?.agencyId);
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
          {agency.name} is on Free, so there&rsquo;s nothing to pay. <Link href="/settings/plan/plans">See the plans</Link>.
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
                <Link className="btn sm" href="/settings/plan/plans">
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
                          ? "The last payment didn't go through"
                          : "Charged to the card on file"}
                  </span>
                </span>
                <span>{day(billing.cancel_at ?? billing.period_ends_at)}</span>
              </div>
            )}
          </>
        )}
        <div className="srow">
          <span className="sl">
            <b>{portalLabel}</b>
            <span>{portalNote}</span>
          </span>
          <button
            type="button"
            className="btn sm"
            disabled={portal.isPending}
            onClick={() => portal.mutate(window.open("", "_blank"))}
          >
            {portal.isPending ? "Opening…" : "Open"}
          </button>
        </div>
        {portal.error && <p className="autherr">{errorMessage(portal.error, "Couldn't open billing")}</p>}
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
