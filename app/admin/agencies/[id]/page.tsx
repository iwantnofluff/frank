"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useAdminAgencies, useUpdateAgency, type AdminAgency } from "@/hooks/use-admin-agencies";
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
  const [seats, setSeats] = useState(String(agency.seat_limit));
  const [clients, setClients] = useState(String(agency.client_limit));
  const [ai, setAi] = useState(String(agency.ai_monthly_request_cap));
  const [saved, setSaved] = useState(false);
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

      <div className="msection-h">Limits</div>
      <p className="msection-d">
        Using {plural(agency.members, "team member")}, {plural(agency.clients, "client")} and{" "}
        {plural(agency.ai_this_month, "AI request")} this month.
      </p>
      <div className="field">
        <label htmlFor="agPlan">Plan</label>
        <select id="agPlan" value={plan} onChange={(e) => setPlan(e.target.value)}>
          {PLANS.map((p) => (
            <option key={p} value={p}>
              {p[0].toUpperCase() + p.slice(1)}
            </option>
          ))}
        </select>
      </div>
      <div className="frow">
        <div className="field">
          <label htmlFor="agSeats">Team Members</label>
          <input id="agSeats" className="bin one" inputMode="numeric" value={seats} onChange={(e) => setSeats(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="agClients">Clients</label>
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
              .mutateAsync({ plan, seat_limit: Number(seats), client_limit: Number(clients), ai_monthly_request_cap: Number(ai) })
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
