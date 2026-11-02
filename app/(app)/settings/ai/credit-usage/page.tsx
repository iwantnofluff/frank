"use client";

import { useMemo } from "react";
import { SettingsHead } from "@/components/settings/SettingsHead";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { useAgencyAiSettings } from "@/hooks/use-agency-ai-settings";
import { useAiUsage } from "@/hooks/use-ai-usage";
import { summariseUsage } from "@/lib/ai/usage";
import { TASK_LABELS } from "@/lib/admin/ai-usage";
import type { AiTask } from "@/lib/ai/run-ai-task";
import { seesAllClients } from "@/lib/roles";
import { errorMessage } from "@/lib/errors";

// Settings → AI Governance → Credit Usage (decided directly, 2 Nov 2026):
// this month's AI requests against the workspace's allowance, by day,
// feature and person. Requests only, never cost: Frank pays for the AI, the
// allowance is what a workspace needs to know. Owners and Admins only.

const num = (n: number) => n.toLocaleString("en");
const dayMonth = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const taskLabel = (t: string | null) => (t ? (TASK_LABELS[t as AiTask] ?? t) : "Earlier requests");

export default function CreditUsagePage() {
  const { data: agency } = useMyAgency();
  const { data: me, isLoading: meLoading } = useMyMembership(agency?.agencyId);
  const isAdmin = !!me && !me.client_id && seesAllClients(me.role);
  const { data: settings } = useAgencyAiSettings(isAdmin ? agency?.agencyId : undefined);
  const { data, isLoading, error } = useAiUsage(isAdmin);

  const s = useMemo(() => (data ? summariseUsage(data.rows, new Date(data.readAt)) : null), [data]);
  const cap = settings?.ai_monthly_request_cap;

  return (
    <div className="pad creditusage">
      <SettingsHead
        title="Credit Usage"
        description="How much of your monthly AI allowance has been used. For Owners and Admins."
      />
      {meLoading && <p className="sub">Frank is working…</p>}
      {!meLoading && !isAdmin && <p className="note">Only Owners and Admins can see Credit Usage.</p>}
      {isAdmin && (isLoading || cap === undefined) && !error && <p className="sub">Frank is working…</p>}
      {error && <p className="autherr">{errorMessage(error, "Couldn't load Credit Usage")}</p>}
      {isAdmin && s && cap !== undefined && (
        <>
          <div className="stats">
            <div className="stat">
              <div className="n">{num(s.used)}</div>
              <div className="l">Used this month</div>
            </div>
            <div className="stat">
              <div className={`n${s.used >= cap ? " flag" : ""}`}>{num(Math.max(0, cap - s.used))}</div>
              <div className="l">Left, of {num(cap)}</div>
            </div>
            <div className="stat">
              <div className="n">{num(Math.round((s.used / Math.max(1, s.byDay.filter((d) => !d.future).length)) * 10) / 10)}</div>
              <div className="l">A day, on average</div>
            </div>
            <div className="stat">
              <div className="n">{dayMonth(s.resetsOn)}</div>
              <div className="l">Resets on</div>
            </div>
          </div>
          <div
            className="cu-meter"
            role="meter"
            aria-label="Allowance used"
            aria-valuemin={0}
            aria-valuemax={cap}
            aria-valuenow={Math.min(s.used, cap)}
            aria-valuetext={`${num(s.used)} of ${num(cap)} requests`}
          >
            <span className="an-bar-t">
              <i className={s.used >= cap * 0.9 ? "bad" : ""} style={{ width: `${Math.min(100, (s.used / Math.max(1, cap)) * 100)}%` }} />
            </span>
            <span className="an-note">
              {s.used >= cap
                ? "The allowance is used up. Drafting and checks start again when it resets."
                : `${Math.round((s.used / Math.max(1, cap)) * 100)}% used. Each draft, check, proofread or sorted client comment is one request.`}
            </span>
          </div>

          <section className="an-sec">
            <div className="an-sec-h">
              <h2>Day by day</h2>
              <span>{new Date(data!.readAt).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</span>
            </div>
            <DayChart days={s.byDay} />
          </section>

          <div className="an-cols">
            <section className="an-sec">
              <div className="an-sec-h">
                <h2>By feature</h2>
              </div>
              <Bars rows={s.byTask.map((t) => ({ label: taskLabel(t.task), value: t.requests }))} />
            </section>
            <section className="an-sec">
              <div className="an-sec-h">
                <h2>By person</h2>
              </div>
              <Bars rows={s.byPerson.map((p) => ({ label: data!.names[p.userId] ?? "Someone who has left", value: p.requests }))} />
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function DayChart({ days }: { days: { day: number; requests: number; future: boolean }[] }) {
  const max = Math.max(1, ...days.map((d) => d.requests));
  return (
    <div className="cu-days" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
      {days.map((d) => (
        <span
          key={d.day}
          className={`an-trend-col${d.future ? " future" : ""}`}
          title={d.future ? undefined : `${d.day}: ${d.requests} ${d.requests === 1 ? "request" : "requests"}`}
        >
          {d.requests > 0 && <i style={{ height: `${(d.requests / max) * 100}%` }} />}
        </span>
      ))}
      {days.map((d) => (
        <span key={`l${d.day}`} className="an-trend-wk">
          {d.day === 1 || d.day % 5 === 0 ? d.day : ""}
        </span>
      ))}
    </div>
  );
}

function Bars({ rows }: { rows: { label: string; value: number }[] }) {
  if (!rows.length) return <p className="an-note">Nothing yet this month.</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="an-bars">
      {rows.map((r) => (
        <div className="an-bar" key={r.label}>
          <span className="an-bar-l">{r.label}</span>
          <span className="an-bar-t">
            <i style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="an-bar-n">{num(r.value)}</span>
        </div>
      ))}
    </div>
  );
}
