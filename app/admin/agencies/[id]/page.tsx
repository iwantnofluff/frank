"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  useAdminAgencies,
  useHandlePlanRequest,
  useUpdateAgency,
  type AdminAgency,
} from "@/hooks/use-admin-agencies";
import { AI_REQUESTS_PER_MONTH, formatBytes, isReadOnly, limitLabel, planById } from "@/lib/plans";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
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
  const [confirmPause, setConfirmPause] = useState(false);
  const tier = planById(agency.plan);
  const whole = (v: string) => (v.trim() === "" ? 0 : Number(v));

  return (
    <div className="adminform">
      {/* The menu's own arrow (direct instruction), level with the one above
          Dashboard. */}
      <Link href="/admin" className="reviewnav-toggle adminback" aria-label="Back to agencies" title="Back to agencies">
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
                Currently {planById(agency.plan)?.name ?? agency.plan}. Applying it moves the agency to that plan and its
                limits.
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
          {handle.error && <p className="autherr" style={{ padding: "0 15px 12px" }}>{errorMessage(handle.error, "Couldn't do that")}</p>}
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
        The plan is the agency&rsquo;s to choose, in its Settings → Your Plan. Add to its limits with the override below.
      </p>

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
          ["AI requests a month", AI_REQUESTS_PER_MONTH, agency.extra_ai_requests, agency.ai_monthly_request_cap, limitLabel],
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

      <div className="msection-h">Admin Override</div>
      <p className="msection-d">Added on top of the plan&rsquo;s limits, and kept when the plan changes. 0 adds nothing.</p>
      <div className="frow">
        <div className="field">
          <label htmlFor="agXSeats">Extra Team Members</label>
          <input id="agXSeats" className="bin one" inputMode="numeric" value={seats} onChange={(e) => setSeats(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="agXClients">Extra Clients</label>
          <input id="agXClients" className="bin one" inputMode="numeric" value={clients} onChange={(e) => setClients(e.target.value)} />
        </div>
      </div>
      <div className="frow">
        <div className="field">
          <label htmlFor="agXAi">Extra AI Requests a Month</label>
          <input id="agXAi" className="bin one" inputMode="numeric" value={ai} onChange={(e) => setAi(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="agXStorage">
            Extra Storage <span className="hint">GB</span>
          </label>
          <input id="agXStorage" className="bin one" inputMode="decimal" value={storageGb} onChange={(e) => setStorageGb(e.target.value)} />
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
        <button type="button" className="btn" disabled={update.isPending} onClick={() => update.mutate({ suspended: false })}>
          Reactivate
        </button>
      ) : (
        <button type="button" className="btn danger" onClick={() => setConfirmPause(true)}>
          Pause Agency
        </button>
      )}
      {confirmPause && (
        <ConfirmDialog
          title={`Pause ${agency.name}?`}
          message={`nobody at ${agency.name} or its clients will be able to sign in or open review links until you reactivate it. Nothing is deleted.`}
          confirmLabel="Pause Agency"
          pendingLabel="Pausing…"
          isPending={update.isPending}
          error={update.error}
          onConfirm={() => update.mutateAsync({ suspended: true }).then(() => setConfirmPause(false)).catch(() => {})}
          onClose={() => setConfirmPause(false)}
        />
      )}
    </div>
  );
}
