"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useAdminAgencies, useHandlePlanRequest, useUpdateAgency, type AdminAgency } from "@/hooks/use-admin-agencies";
import { AI_REQUESTS_PER_MONTH, formatBytes, isReadOnly, limitLabel, planById } from "@/lib/plans";
import { AdminActionModal } from "@/components/admin/AdminActionModal";
import { useAdminAction, useAgencyActions, useAgencyHealth } from "@/hooks/use-admin-actions";
import { PeopleTable } from "@/components/admin/PeopleTable";
import { useAdminUsers } from "@/hooks/use-admin-users";
import { roleRank } from "@/lib/roles";
import { errorMessage } from "@/lib/errors";
import { ROOT_DOMAIN } from "@/lib/tenant";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// One agency: its limits, and pausing it.
export default function AdminAgencyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: agencies, isLoading } = useAdminAgencies();
  const agency = agencies?.find((a) => a.id === id);
  if (isLoading) return <p className="sub">Loading…</p>;
  if (!agency) return <p className="sub">No agency with that id.</p>;
  return <AgencyForm key={agency.id} agency={agency} />;
}

const GB = 1024 ** 3;

function AgencyForm({ agency }: { agency: AdminAgency }) {
  const update = useUpdateAgency(agency.id);
  const handle = useHandlePlanRequest();
  // The override (phase42): added to the plan's limits.
  const [seats, setSeats] = useState(String(agency.extra_seats));
  const [clients, setClients] = useState(String(agency.extra_clients));
  const [ai, setAi] = useState(String(agency.extra_ai_requests));
  const [storageGb, setStorageGb] = useState(String(+(agency.extra_storage_bytes / GB).toFixed(2)));
  const [saved, setSaved] = useState(false);
  const [pausing, setPausing] = useState<"pause" | "unpause" | null>(null);
  const [extending, setExtending] = useState(false);
  const [days, setDays] = useState("14");
  const extend = useAdminAction<{ trialEndsAt: string }>();
  const tier = planById(agency.plan);
  const whole = (v: string) => (v.trim() === "" ? 0 : Number(v));

  return (
    <div className="adminform">
      {/* The menu's own arrow (direct instruction), level with the one above
          Dashboard. */}
      <Link
        href="/admin/agencies"
        className="reviewnav-toggle adminback"
        aria-label="Back to agencies"
        title="Back to agencies"
      >
        <svg viewBox="0 0 24 24">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </Link>
      <h1 className="h1">{agency.name}</h1>
      <p className="sub">
        {agency.subdomain ? `${agency.subdomain}.${ROOT_DOMAIN}` : "No address"} ·{" "}
        {agency.suspended_at ? "Paused" : "Active"} · joined {new Date(agency.created_at).toLocaleDateString()}
      </p>

      {agency.pending_request && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-h">
            <b>Plan request</b>
            <span className="sync">{new Date(agency.pending_request.created_at).toLocaleDateString()}</span>
          </div>
          <div className="srow">
            <span className="sl">
              <b>
                {planById(agency.pending_request.plan)?.name ?? agency.pending_request.plan}, billed{" "}
                {agency.pending_request.interval}
              </b>
              <span>
                Currently {planById(agency.plan)?.name ?? agency.plan}. Applying it moves the agency to that plan and
                its limits.
              </span>
            </span>
            <span style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn sm"
                disabled={handle.isPending}
                onClick={() => handle.mutate({ id: agency.pending_request!.id, outcome: "declined" })}
              >
                Decline
              </button>
              <button
                type="button"
                className="btn sm primary"
                disabled={handle.isPending}
                onClick={() => handle.mutate({ id: agency.pending_request!.id, outcome: "applied" })}
              >
                Apply
              </button>
            </span>
          </div>
          {handle.error && (
            <p className="autherr" style={{ padding: "0 15px 12px" }}>
              {errorMessage(handle.error, "Couldn't do that")}
            </p>
          )}
        </div>
      )}

      <div className="msection-h">Plan</div>
      <p className="msection-d">
        {tier?.name ?? agency.plan}
        {agency.pays_by_card
          ? ", paid by card through Paddle."
          : agency.plan === "free"
            ? isReadOnly(agency.plan, agency.trial_ends_at)
              ? ", trial ended: read-only until it chooses a plan."
              : `, trial ends ${new Date(agency.trial_ends_at!).toLocaleDateString()}.`
            : "."}{" "}
        The plan is the agency&rsquo;s to choose, in its Settings → Your Plan. Add to its limits with the override
        below.
      </p>
      {agency.plan === "free" && (
        <div className="adminactions">
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              extend.reset();
              setExtending(true);
            }}
          >
            Extend Trial
          </button>
        </div>
      )}
      {extending && (
        <AdminActionModal
          title="Extend the Free Trial"
          message={
            isReadOnly(agency.plan, agency.trial_ends_at)
              ? `${agency.name}'s trial is over, so it's read-only. Extending it counts from today and lifts that.`
              : `${agency.name}'s trial ends ${new Date(agency.trial_ends_at!).toLocaleDateString()}. Extending it adds to that.`
          }
          confirmLabel="Extend Trial"
          isPending={extend.isPending}
          error={extend.error}
          onConfirm={(reason) =>
            extend.mutate(
              { url: `/api/admin/agencies/${agency.id}/extend-trial`, body: { days: Number(days), reason } },
              { onSuccess: () => setExtending(false) },
            )
          }
          onClose={() => setExtending(false)}
        >
          <div className="field">
            <label htmlFor="adDays">Days to add</label>
            <input id="adDays" type="number" min={1} max={90} value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
        </AdminActionModal>
      )}

      <div className="msection-h">Limits</div>
      <p className="msection-d">
        {tier?.name ?? agency.plan}&rsquo;s, plus the override. Using {plural(agency.members, "team member")},{" "}
        {plural(agency.clients, "client")}, {formatBytes(agency.storage_bytes)} and{" "}
        {plural(agency.ai_this_month, "AI request")} this month.
      </p>
      <div className="panel">
        {[
          ["Team members", tier?.seats ?? null, agency.extra_seats, agency.seat_limit, limitLabel],
          ["Active clients", tier?.clients ?? null, agency.extra_clients, agency.client_limit, limitLabel],
          [
            "AI requests a month",
            AI_REQUESTS_PER_MONTH,
            agency.extra_ai_requests,
            agency.ai_monthly_request_cap,
            limitLabel,
          ],
          ["Storage", tier?.storageBytes ?? null, agency.extra_storage_bytes, agency.storage_limit_bytes, formatBytes],
        ].map(([label, base, extra, total, show]) => {
          const fmt = show as (n: number | null) => string;
          return (
            <div className="srow" key={label as string}>
              <span className="sl">
                <b>{label as string}</b>
                <span>
                  {fmt(base as number | null)} on {tier?.name ?? agency.plan}
                  {(extra as number) > 0 ? `, plus ${fmt(extra as number)} added` : ""}
                </span>
              </span>
              <span>{fmt(total as number | null)}</span>
            </div>
          );
        })}
      </div>

      <AgencyHealthSections agencyId={agency.id} />

      <AgencyPeople agencyId={agency.id} />

      <div className="msection-h">Admin Override</div>
      <p className="msection-d">
        Added on top of the plan&rsquo;s limits, and kept when the plan changes. 0 adds nothing.
      </p>
      <div className="frow">
        <div className="field">
          <label htmlFor="agXSeats">Extra Team Members</label>
          <input
            id="agXSeats"
            className="bin one"
            inputMode="numeric"
            value={seats}
            onChange={(e) => setSeats(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="agXClients">Extra Clients</label>
          <input
            id="agXClients"
            className="bin one"
            inputMode="numeric"
            value={clients}
            onChange={(e) => setClients(e.target.value)}
          />
        </div>
      </div>
      <div className="frow">
        <div className="field">
          <label htmlFor="agXAi">Extra AI Requests a Month</label>
          <input
            id="agXAi"
            className="bin one"
            inputMode="numeric"
            value={ai}
            onChange={(e) => setAi(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="agXStorage">
            Extra Storage <span className="hint">GB</span>
          </label>
          <input
            id="agXStorage"
            className="bin one"
            inputMode="decimal"
            value={storageGb}
            onChange={(e) => setStorageGb(e.target.value)}
          />
        </div>
      </div>
      {update.error && <p className="autherr">{errorMessage(update.error, "Couldn't save")}</p>}
      <div className="confirm-acts" style={{ justifyContent: "flex-start", alignItems: "center" }}>
        <button
          type="button"
          className="btn primary"
          disabled={update.isPending}
          onClick={async () => {
            setSaved(false);
            await update
              .mutateAsync({
                extra_seats: whole(seats),
                extra_clients: whole(clients),
                extra_ai_requests: whole(ai),
                extra_storage_bytes: Math.round(Number(storageGb || 0) * GB),
              })
              .then(() => setSaved(true))
              .catch(() => {});
          }}
        >
          {update.isPending ? "Saving…" : "Save Override"}
        </button>
        {saved && <span className="bsaved">Saved.</span>}
      </div>

      <div className="msection-h">{agency.suspended_at ? "Paused" : "Pause this Agency"}</div>
      <p className="msection-d">
        {agency.suspended_at
          ? `Paused on ${new Date(agency.suspended_at).toLocaleDateString()}. Nobody can sign in, and its review links show that it's paused.`
          : "Nobody at the agency, or its clients, can sign in or open review links until it's turned back on. Nothing is deleted."}
      </p>
      {agency.suspended_at ? (
        <button type="button" className="btn" onClick={() => setPausing("unpause")}>
          Reactivate
        </button>
      ) : (
        <button type="button" className="btn danger" onClick={() => setPausing("pause")}>
          Pause Agency
        </button>
      )}
      {pausing && (
        <AdminActionModal
          title={pausing === "pause" ? `Pause ${agency.name}?` : `Reactivate ${agency.name}?`}
          message={
            pausing === "pause"
              ? `Nobody at ${agency.name} or its clients will be able to sign in or open review links until you reactivate it. Nothing is deleted.`
              : `Everyone at ${agency.name} can sign in again, and its review links open.`
          }
          confirmLabel={pausing === "pause" ? "Pause Agency" : "Reactivate"}
          isPending={update.isPending}
          error={update.error}
          onConfirm={(reason) =>
            update
              .mutateAsync({ suspended: pausing === "pause", reason })
              .then(() => setPausing(null))
              .catch(() => {})
          }
          onClose={() => setPausing(null)}
        />
      )}

      <SupportLog agencyId={agency.id} />
    </div>
  );
}

// Everyone in this agency, most senior first (view-only). Each opens their
// page under Users.
function AgencyPeople({ agencyId }: { agencyId: string }) {
  const { data: people, isLoading, error } = useAdminUsers();
  const here = (people ?? [])
    .filter((p) => p.memberships.some((m) => m.agencyId === agencyId))
    .map((p) => ({ p, m: p.memberships.find((m) => m.agencyId === agencyId)! }))
    .sort(
      (a, b) =>
        (a.m.type === "client" ? 4 : roleRank(a.m.type)) - (b.m.type === "client" ? 4 : roleRank(b.m.type)) ||
        a.p.name.localeCompare(b.p.name),
    )
    .map(({ p }) => p);
  return (
    <>
      <div className="msection-h">People</div>
      <p className="msection-d">
        {people
          ? `${here.length === 1 ? "1 person" : `${here.length} people`} here, team and clients.`
          : "Everyone in the agency."}
      </p>
      {isLoading && <p className="sub">Loading…</p>}
      {error && <p className="autherr">{errorMessage(error, "Couldn't load the people")}</p>}
      {people && here.length > 0 && (
        <div className="adminpeople">
          <PeopleTable people={here} agencyId={agencyId} />
        </div>
      )}
    </>
  );
}

// What the admin area has done here (phase51), newest first. The agency's
// Owners see the same in their Settings.
function SupportLog({ agencyId }: { agencyId: string }) {
  const { data: actions, isLoading, error } = useAgencyActions(agencyId);
  return (
    <>
      <div className="msection-h">Support Log</div>
      <p className="msection-d">What Frank has done in this agency, and why. Its Owners see this too.</p>
      {isLoading && <p className="sub">Loading…</p>}
      {error && <p className="autherr">{errorMessage(error, "Couldn't load the log")}</p>}
      {actions && actions.length === 0 && <p className="msection-d">Nothing yet.</p>}
      {actions && actions.length > 0 && (
        <section className="panel" aria-label="Support log">
          {actions.map((a) => (
            <div className="srow" key={a.id}>
              <span className="sl">
                <b>
                  {a.action}
                  {a.target ? `: ${a.target}` : ""}
                </b>
                <span>
                  {a.detail ? `${a.detail.replace(/\.$/, "")}. ` : ""}Why: {a.reason}
                </span>
              </span>
              <span className="srow-note">
                {a.actor_name}
                <br />
                {new Date(a.created_at).toLocaleString(undefined, {
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  trialing: "Trialing",
  past_due: "Payment failed",
  paused: "Paused",
  canceled: "Canceled",
};
const when = (v: string | null) =>
  v ? new Date(v).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

// Billing (our record and Paddle's recent payments) and email problems
// (Resend), read-only.
function AgencyHealthSections({ agencyId }: { agencyId: string }) {
  const { data, isLoading, error } = useAgencyHealth(agencyId);
  const b = data?.billing;
  return (
    <>
      <div className="msection-h">Billing</div>
      {isLoading && <p className="sub">Loading…</p>}
      {error && <p className="autherr">{errorMessage(error, "Couldn't load billing")}</p>}
      {data && !b && <p className="msection-d">Not paying through Paddle.</p>}
      {b && (
        <>
          <p className="msection-d">
            From Paddle.{" "}
            <a href={b.dashboardUrl} target="_blank" rel="noreferrer">
              Open Paddle
            </a>
            {b.subscriptionId ? ` and search for ${b.subscriptionId}.` : "."}
          </p>
          <section className="panel" aria-label="Billing">
            <div className="srow">
              <span className="sl">
                <b>Subscription</b>
              </span>
              <span className="srow-v">
                {b.subscriptionId ? (STATUS_LABEL[b.status ?? ""] ?? b.status ?? "—") : "None"}
                {b.interval ? `, billed ${b.interval === "annual" ? "yearly" : "monthly"}` : ""}
              </span>
            </div>
            <div className="srow">
              <span className="sl">
                <b>{b.cancelAt ? "Cancels" : "Renews"}</b>
              </span>
              <span className="srow-v">{when(b.cancelAt ?? b.renewsAt)}</span>
            </div>
            {b.scheduledPlan && (
              <div className="srow">
                <span className="sl">
                  <b>Moving to</b>
                </span>
                <span className="srow-v">
                  {planById(b.scheduledPlan)?.name ?? b.scheduledPlan} on {when(b.renewsAt)}
                </span>
              </div>
            )}
            <div className="srow">
              <span className="sl">
                <b>Recent payments</b>
              </span>
              <span className="srow-v">
                {b.paymentsError ? (
                  <span className="autherr">Paddle didn&rsquo;t answer: {b.paymentsError}</span>
                ) : b.payments.length === 0 ? (
                  "None yet"
                ) : (
                  <span className="adminlist">
                    {b.payments.map((p) => (
                      <span key={p.id}>
                        {when(p.at)} · {p.amount ?? "—"} · {p.status.replace("_", " ")}
                      </span>
                    ))}
                  </span>
                )}
              </span>
            </div>
          </section>
        </>
      )}

      <div className="msection-h">Email</div>
      {data?.email.error ? (
        <p className="autherr">Resend didn&rsquo;t answer: {data.email.error}</p>
      ) : (
        data && (
          <>
            <p className="msection-d">
              {data.email.problems.length
                ? "Addresses of people here that Frank's emails aren't reaching. Invites and resets to them won't arrive."
                : "No bounces or failures for anyone here."}
            </p>
            {data.email.problems.length > 0 && (
              <section className="panel" aria-label="Email problems">
                {data.email.problems.map((p, i) => (
                  <div className="srow" key={`${p.email}-${i}`}>
                    <span className="sl">
                      <b>{p.email}</b>
                      <span>
                        {p.problem}
                        {p.subject ? `: "${p.subject}"` : ""}
                      </span>
                    </span>
                    <span className="srow-note">{when(p.at)}</span>
                  </div>
                ))}
              </section>
            )}
          </>
        )
      )}
    </>
  );
}
