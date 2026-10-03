"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  useAdminAgencies,
  useHandlePlanRequest,
  useUpdateAgency,
  type AdminAgency,
} from "@/hooks/use-admin-agencies";
import { planById } from "@/lib/plans";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { errorMessage } from "@/lib/errors";

const PLANS = ["free", "starter", "growth", "agency", "enterprise"];
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

function AgencyForm({ agency }: { agency: AdminAgency }) {
  const update = useUpdateAgency(agency.id);
  const [plan, setPlan] = useState(agency.plan);
  // An empty box is unlimited.
  const [seats, setSeats] = useState(agency.seat_limit === null ? "" : String(agency.seat_limit));
  const [clients, setClients] = useState(agency.client_limit === null ? "" : String(agency.client_limit));
  const handle = useHandlePlanRequest();
  const limitOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
  const [ai, setAi] = useState(String(agency.ai_monthly_request_cap));
  const [saved, setSaved] = useState(false);
  const [address, setAddress] = useState(agency.subdomain ?? "");
  const [addressSaved, setAddressSaved] = useState(false);
  const changeAddress = useUpdateAgency(agency.id);
  const [confirmPause, setConfirmPause] = useState(false);

  return (
    <div className="adminform">
      <Link href="/admin" className="tdim">
        ← Agencies
      </Link>
      <h1 className="h1">{agency.name}</h1>
      <p className="sub">
        {agency.subdomain ? `${agency.subdomain}.beingfrank.app` : "No address"} ·{" "}
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

      <div className="msection-h">Address</div>
      <p className="msection-d">
        Where the agency signs in. Invites and review links already sent use the old address, which stops working once
        it changes.
      </p>
      <div className="field">
        <label htmlFor="agAddress">Address</label>
        <div className="subfield">
          <input
            id="agAddress"
            className="bin one"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
              setAddressSaved(false);
            }}
          />
          <span>.beingfrank.app</span>
        </div>
      </div>
      {changeAddress.error && <p className="autherr">{errorMessage(changeAddress.error, "Couldn't change the address")}</p>}
      <div className="confirm-acts" style={{ justifyContent: "flex-start", alignItems: "center", marginTop: 0 }}>
        <button
          type="button"
          className="btn"
          disabled={changeAddress.isPending || !address || address === agency.subdomain}
          onClick={() =>
            changeAddress
              .mutateAsync({ subdomain: address })
              .then(() => setAddressSaved(true))
              .catch(() => {})
          }
        >
          {changeAddress.isPending ? "Changing…" : "Change Address"}
        </button>
        {addressSaved && <span className="bsaved">Changed.</span>}
      </div>

      <div className="msection-h">Limits</div>
      <p className="msection-d">
        On {planById(agency.plan)?.name ?? agency.plan}. Using {plural(agency.members, "team member")},{" "}
        {plural(agency.clients, "client")} and{" "}
        {plural(agency.ai_this_month, "AI request")} this month.
      </p>
      <div className="field">
        <label htmlFor="agPlan">Plan</label>
        <select
          id="agPlan"
          value={plan}
          onChange={(e) => {
            // A plan brings its own limits; adjust after, if needed.
            setPlan(e.target.value);
            const tier = planById(e.target.value);
            if (tier) {
              setSeats(tier.seats === null ? "" : String(tier.seats));
              setClients(tier.clients === null ? "" : String(tier.clients));
            }
          }}
        >
          {PLANS.map((p) => (
            <option key={p} value={p}>
              {p[0].toUpperCase() + p.slice(1)}
            </option>
          ))}
        </select>
      </div>
      <div className="frow">
        <div className="field">
          <label htmlFor="agSeats">
            Team Members <span className="hint">empty is unlimited</span>
          </label>
          <input id="agSeats" className="bin one" inputMode="numeric" value={seats} onChange={(e) => setSeats(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="agClients">
            Clients <span className="hint">empty is unlimited</span>
          </label>
          <input id="agClients" className="bin one" inputMode="numeric" value={clients} onChange={(e) => setClients(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="agAi">AI Requests a Month</label>
          <input id="agAi" className="bin one" inputMode="numeric" value={ai} onChange={(e) => setAi(e.target.value)} />
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
                plan,
                seat_limit: limitOrNull(seats),
                client_limit: limitOrNull(clients),
                ai_monthly_request_cap: Number(ai),
              })
              .then(() => setSaved(true))
              .catch(() => {});
          }}
        >
          {update.isPending ? "Saving…" : "Save Limits"}
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
