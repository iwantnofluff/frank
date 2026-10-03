"use client";

import { useEffect, useState } from "react";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { useClients } from "@/hooks/use-clients";
import { useTeamMembers } from "@/hooks/use-team-members";
import { useStorageUsed } from "@/hooks/use-storage-used";
import { usePendingPlanRequest, useRequestPlan } from "@/hooks/use-plan";
import {
  useBilling,
  useChangePlan,
  usePreviewChange,
  useRefreshPlan,
  useStartCheckout,
  useUndoPlanChange,
} from "@/hooks/use-billing";
import { SettingsHead } from "@/components/settings/SettingsHead";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PLANS, formatBytes, isReadOnly, limitLabel, planById, type Plan } from "@/lib/plans";
import { seesAllClients } from "@/lib/roles";
import { billingConfigured, PADDLE_TEST_MODE } from "@/lib/billing/paddle-js";
import { classifyChange } from "@/lib/billing/rules";
import type { Interval } from "@/lib/billing/prices";
import { errorMessage } from "@/lib/errors";

function price(plan: Plan, interval: Interval) {
  if (plan.monthly === null) return { amount: "Custom", per: "" };
  if (plan.monthly === 0) return { amount: "$0", per: "30-day trial" };
  const n = interval === "annual" ? plan.annualPerMonth! : plan.monthly;
  return { amount: `$${n}`, per: interval === "annual" ? "a month, billed yearly" : "a month" };
}

const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "the end of this period";

type Choice = { plan: Plan; via: "request" | "change" };

// Settings → Your Plan → Plans: the agency's plan, its usage, and every
// tier the spec offers (phase38). Paying through Paddle (phase39): an
// agency on Free, or already paying through Paddle, chooses a plan here
// and pays by card; a paid plan Frank set by hand, and Enterprise, still
// send Frank a request (decided directly).
export default function PlansPage() {
  const { data: agency } = useMyAgency();
  const agencyId = agency?.agencyId;
  const { data: me } = useMyMembership(agencyId);
  const { data: clients } = useClients();
  const { data: team } = useTeamMembers(agencyId);
  const { data: stored } = useStorageUsed(agencyId);
  const { data: pending } = usePendingPlanRequest(agencyId);
  const request = useRequestPlan(agencyId);
  // Waiting for Paddle's notification after paying.
  const [awaiting, setAwaiting] = useState<string | null>(null);
  const { data: billing } = useBilling(agencyId, !!awaiting);
  const checkout = useStartCheckout(agencyId);
  const preview = usePreviewChange(agencyId);
  const change = useChangePlan(agencyId);
  const undo = useUndoPlanChange(agencyId);
  const refreshPlan = useRefreshPlan(agencyId);
  const [picked, setBilling] = useState<Interval | null>(null);
  const [choosing, setChoosing] = useState<Choice | null>(null);

  // The spec: billing is managed by the agency's Admins and Owners.
  const canChange = me?.client_id === null && seesAllClients(me?.role);
  const current = planById(agency?.plan) ?? null;
  const activeClients = (clients ?? []).filter((c) => !c.archived_at).length;
  const seatsUsed = (team ?? []).filter((m) => !m.removed_at).length;

  const live = !!billing?.paddle_subscription_id && billing.status !== "canceled";
  const byCard = billingConfigured() && (agency?.plan === "free" || live);
  const paidInterval: Interval | null = live ? (billing?.billing_interval ?? "monthly") : null;
  const interval: Interval = picked ?? paidInterval ?? "monthly";
  const waiting = live && (!!billing?.scheduled_plan || !!billing?.cancel_at);

  // Paid: once the notification has landed, the plan has moved.
  useEffect(() => {
    if (awaiting && live) {
      refreshPlan().then(() => setAwaiting(null));
    }
  }, [awaiting, live, refreshPlan]);

  // What a plan's button does. `request`: it asks Frank, rather than Paddle.
  function actionFor(plan: Plan): { label: string; run?: () => void; current?: boolean; request?: boolean } {
    const isCurrentTier = current?.id === plan.id;
    if (plan.id === "enterprise") {
      return isCurrentTier
        ? { label: "Current plan", current: true }
        : { label: "Talk to us", request: true, run: () => setChoosing({ plan, via: "request" }) };
    }
    if (!byCard) {
      return isCurrentTier
        ? { label: "Current plan", current: true }
        : { label: `Choose ${plan.name}`, request: true, run: () => setChoosing({ plan, via: "request" }) };
    }
    if (!live) {
      return isCurrentTier
        ? { label: "Current plan", current: true }
        : {
            label: `Choose ${plan.name}`,
            run: () =>
              checkout.mutate(
                { plan: plan.id, interval },
                { onSuccess: (result) => result === "paid" && setAwaiting(plan.name) },
              ),
          };
    }
    if (plan.id === "free") return { label: "Choose Free", run: () => openChange(plan) };
    const kind = classifyChange({ plan: current!.id, interval: paidInterval! }, { plan: plan.id, interval }).kind;
    if (kind === "same") return { label: "Current plan", current: true };
    const label = isCurrentTier ? `Switch to ${interval === "annual" ? "Yearly" : "Monthly"}` : `Choose ${plan.name}`;
    // Yearly to monthly is arranged by Frank (lib/billing/rules.ts).
    if (kind === "ask") return { label, request: true, run: () => setChoosing({ plan, via: "request" }) };
    return { label, run: () => openChange(plan) };
  }

  function openChange(plan: Plan) {
    change.reset();
    preview.reset();
    setChoosing({ plan, via: "change" });
    preview.mutate({ plan: plan.id, interval });
  }

  function closeDialog() {
    setChoosing(null);
    request.reset();
    change.reset();
    preview.reset();
  }

  const p = preview.data;
  const per = interval === "annual" ? "a year" : "a month";
  const changeMessage = !choosing
    ? ""
    : preview.isPending
      ? `working out what moving to ${choosing.plan.name} costs…`
      : !p
        ? `moving to ${choosing.plan.name} can't be done right now.`
        : p.kind === "cancel"
          ? `you'll keep ${current?.name} until ${day(p.effectiveAt)}. Then ${agency?.name} moves to Free: ${limitLabel(choosing.plan.clients)} active client and ${limitLabel(choosing.plan.seats)} team members. Nothing more is charged.`
          : p.kind === "downgrade"
            ? `you'll keep ${current?.name} until ${day(p.effectiveAt)}. Then ${agency?.name} moves to ${choosing.plan.name}, at ${p.recurring} ${per}. Nothing is charged today.`
            : `moving to ${choosing.plan.name} costs ${p.dueNow} today, for the rest of this period. After that it's ${p.recurring} ${per}, from ${day(p.nextBilledAt)}.`;

  return (
    <div className="pad" style={{ maxWidth: 1100 }}>
      <SettingsHead title="Plans" description="Your agency's plan, what it includes, and the plans you can move to." />

      {current && (
        <div className="panel">
          <div className="panel-h">
            <b>Current plan: {current.name}</b>
            <span className="sync">
              {price(current, paidInterval ?? "monthly").amount}
              {price(current, paidInterval ?? "monthly").per && ` ${price(current, paidInterval ?? "monthly").per}`}
            </span>
          </div>
          <div className="srow">
            <span className="sl">
              <b>Active clients</b>
              <span>Archived clients don&rsquo;t count</span>
            </span>
            <span>
              {activeClients} of {limitLabel(agency?.clientLimit)}
            </span>
          </div>
          <div className="srow">
            <span className="sl">
              <b>Team members</b>
              <span>Including invites not yet accepted</span>
            </span>
            <span>
              {seatsUsed} of {limitLabel(agency?.seatLimit)}
            </span>
          </div>
          <div className="srow">
            <span className="sl">
              <b>Storage</b>
              <span>Every file uploaded, across all clients</span>
            </span>
            <span>
              {formatBytes(stored ?? 0)} of {formatBytes(agency?.storageLimit)}
            </span>
          </div>
          {current.id === "free" && (
            <div className="srow">
              <span className="sl">
                <b>Free trial</b>
                <span>
                  {isReadOnly(agency?.plan, agency?.trialEndsAt)
                    ? "Ended: Frank is read-only until you choose a plan"
                    : "Everything works until then; after it, Frank is read-only until you choose a plan"}
                </span>
              </span>
              <span>{agency?.trialEndsAt ? `${isReadOnly(agency.plan, agency.trialEndsAt) ? "Ended" : "Ends"} ${day(agency.trialEndsAt)}` : "Ended"}</span>
            </div>
          )}
          {live && !waiting && (
            <div className="srow">
              <span className="sl">
                <b>Renews</b>
                <span>Paid through Paddle, {paidInterval === "annual" ? "yearly" : "monthly"}</span>
              </span>
              <span>{day(billing?.period_ends_at)}</span>
            </div>
          )}
        </div>
      )}

      {waiting && (
        <div className="note">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 16v-5M12 8h.01" />
          </svg>
          <div>
            {billing?.cancel_at
              ? `Your plan ends on ${day(billing.cancel_at)}. Then ${agency?.name} moves to Free.`
              : `${agency?.name} moves to ${planById(billing?.scheduled_plan)?.name} on ${day(billing?.period_ends_at)}. You keep ${current?.name} until then.`}{" "}
            {canChange && (
              <button type="button" className="btn sm" disabled={undo.isPending} onClick={() => undo.mutate()}>
                {undo.isPending ? "Keeping it…" : `Keep ${current?.name}`}
              </button>
            )}
            {undo.error && <span className="autherr"> {errorMessage(undo.error, "Couldn't undo the change")}</span>}
          </div>
        </div>
      )}

      {live && billing?.status === "past_due" && (
        <div className="note warn">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" />
          </svg>
          <div>Your last payment didn&rsquo;t go through. Paddle will try again; you can change the card in Billing → Payment Methods.</div>
        </div>
      )}

      {awaiting && (
        <div className="note">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <path d="M8 12l3 3 5-6" />
          </svg>
          <div>Payment received. Setting up {awaiting} — this usually takes a few seconds.</div>
        </div>
      )}

      {pending && (
        <div className="note">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 16v-5M12 8h.01" />
          </svg>
          <div>
            You&rsquo;ve asked to move to {planById(pending.requested_plan)?.name ?? pending.requested_plan}, billed{" "}
            {pending.billing_interval}, on {new Date(pending.created_at).toLocaleDateString()}. Frank will confirm it with
            you, and set up payment, before anything changes.
          </div>
        </div>
      )}

      <div className="planbar">
        <div className="filters" role="group" aria-label="Billing">
          <button type="button" className="chip" aria-pressed={interval === "monthly"} onClick={() => setBilling("monthly")}>
            Monthly
          </button>
          <button type="button" className="chip" aria-pressed={interval === "annual"} onClick={() => setBilling("annual")}>
            Annual <span className="plansave">save 20%</span>
          </button>
        </div>
        {byCard && PADDLE_TEST_MODE && (
          <span className="tag amber" title="Payments are in Paddle's sandbox. No money moves.">
            Test mode: card 4242 4242 4242 4242
          </span>
        )}
        {!canChange && <span className="sub">Only Admins and Owners can change the plan.</span>}
        {canChange && billingConfigured() && !byCard && current?.id !== "free" && (
          <span className="sub">Your plan is arranged with Frank. Ask to change it below.</span>
        )}
      </div>
      {checkout.error && <p className="autherr">{errorMessage(checkout.error, "Couldn't start the checkout")}</p>}

      <div className="plangrid">
        {PLANS.map((plan) => {
          const pr = price(plan, interval);
          const isCurrent = current?.id === plan.id;
          const isPending = pending?.requested_plan === plan.id;
          const action = actionFor(plan);
          const viaRequest = !!action.request;
          const blocked = viaRequest ? !!pending : waiting || !!awaiting || checkout.isPending;
          return (
            <div key={plan.id} className={`plancard${isCurrent ? " current" : ""}`} aria-label={`${plan.name} plan`}>
              <div className="plancard-h">
                <b>{plan.name}</b>
                {isCurrent && <span className="tag green">Active</span>}
                {isPending && !isCurrent && <span className="tag amber">Requested</span>}
              </div>
              <div className="planprice">
                {pr.amount}
                {pr.per && <span>{pr.per}</span>}
              </div>
              <ul className="planlist">
                <li>{plan.clients === null ? "Unlimited clients" : `${plan.clients} active client${plan.clients === 1 ? "" : "s"}`}</li>
                <li>{plan.seats === null ? "Unlimited team members" : `${plan.seats} team members`}</li>
                <li>{plan.storage} storage</li>
                {plan.highlights.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
              {action.current ? (
                <button type="button" className="btn" disabled>
                  Current plan
                </button>
              ) : (
                <button
                  type="button"
                  className="btn primary"
                  disabled={!canChange || isPending || blocked}
                  title={
                    waiting && !viaRequest
                      ? "Keep your plan, or wait for the change, first"
                      : pending && !isPending && viaRequest
                        ? "There's already a request waiting"
                        : undefined
                  }
                  onClick={action.run}
                >
                  {checkout.isPending && checkout.variables?.plan === plan.id ? "Opening checkout…" : action.label}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {choosing?.via === "request" && (
        <ConfirmDialog
          tone="primary"
          title={`Move to ${choosing.plan.name}?`}
          message={`this asks Frank to move ${agency?.name ?? "your agency"} to ${choosing.plan.name}${
            choosing.plan.monthly ? `, at ${price(choosing.plan, interval).amount} ${price(choosing.plan, interval).per}` : ""
          }. Frank will confirm it with you, and set up payment, before anything changes.`}
          confirmLabel="Send Request"
          pendingLabel="Sending…"
          isPending={request.isPending}
          error={request.error}
          errorFallback="Couldn't send the request"
          onConfirm={() =>
            request
              .mutateAsync({ plan: choosing.plan.id, interval })
              .then(() => setChoosing(null))
              .catch(() => {})
          }
          onClose={closeDialog}
        />
      )}

      {choosing?.via === "change" && (
        <ConfirmDialog
          tone="primary"
          title={`Move to ${choosing.plan.name}?`}
          message={changeMessage}
          confirmLabel={p?.kind === "upgrade" ? `Pay ${p.dueNow}` : `Move to ${choosing.plan.name}`}
          pendingLabel={preview.isPending ? "Working it out…" : "Changing…"}
          isPending={preview.isPending || change.isPending}
          error={preview.error ?? change.error}
          errorFallback="Couldn't change the plan"
          onConfirm={
            preview.isError
              ? undefined
              : () =>
                  change
                    .mutateAsync({ plan: choosing.plan.id, interval })
                    .then(() => setChoosing(null))
                    .catch(() => {})
          }
          onClose={closeDialog}
        />
      )}
    </div>
  );
}
