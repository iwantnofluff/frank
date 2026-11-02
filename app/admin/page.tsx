"use client";

import { useState } from "react";
import Link from "next/link";
import { useAdminOverview } from "@/hooks/use-admin-overview";
import type { AdminOverview, AgencyRef } from "@/lib/admin/overview";
import { day, money, monthLabel, num } from "@/lib/admin/format";
import { formatBytes } from "@/lib/plans";
import { errorMessage } from "@/lib/errors";

const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;

// One agency in a list: its name and address, opening its page; a note on
// the right.
function AgencyRow({ agency, note }: { agency: AgencyRef; note: React.ReactNode }) {
  return (
    <div className="srow">
      <span className="sl">
        <Link href={`/admin/agencies/${agency.id}`} className="admintbl-name">
          {agency.name}
        </Link>
        {(agency.subdomain || agency.ownerEmail) && (
          <span>{[agency.subdomain, agency.ownerEmail].filter(Boolean).join(" · ")}</span>
        )}
      </span>
      <span className="srow-note">{note}</span>
    </div>
  );
}

function Group<T extends AgencyRef>({
  title,
  hint,
  items,
  note,
}: {
  title: string;
  hint: string;
  items: T[];
  note: (item: T) => React.ReactNode;
}) {
  if (!items.length) return null;
  return (
    <section className="panel" aria-label={title}>
      <div className="panel-h">
        <b>{title}</b>
        <span className="sync">{hint}</span>
      </div>
      {items.map((a) => (
        <AgencyRow key={a.id} agency={a} note={note(a)} />
      ))}
    </section>
  );
}

// One measure over the last six months (decided directly, 2 Nov 2026):
// a small bar chart of its own, so no two measures share a scale. The
// latest month is the headline; hovering a bar shows its month and value.
function Trend({
  title,
  months,
  values,
  show,
}: {
  title: string;
  months: string[];
  values: number[];
  show: (n: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...values, 0);
  const W = 240;
  const H = 72;
  const slot = W / values.length;
  const barW = slot - 8;
  const at = hover ?? values.length - 1;
  return (
    <div className="admintrend">
      <div className="admintrend-h">
        <span>{title}</span>
        <b>{show(values[at] ?? 0)}</b>
        <span className="admintrend-m">{hover === null ? "This month" : monthLabel(months[at])}</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H + 16}`}
        role="img"
        aria-label={`${title}: ${months.map((m, i) => `${monthLabel(m)} ${show(values[i])}`).join(", ")}`}
        onMouseLeave={() => setHover(null)}
      >
        <line x1="0" x2={W} y1={H} y2={H} className="admintrend-base" />
        {values.map((v, i) => {
          const h = max > 0 ? Math.max(v > 0 ? 5 : 0, (v / max) * (H - 4)) : 0;
          const x = i * slot + 4;
          return (
            <g key={months[i]} onMouseEnter={() => setHover(i)}>
              {/* The hit area: the whole slot, taller than the bar. */}
              <rect x={i * slot} y={0} width={slot} height={H + 16} fill="transparent" />
              {h > 0 && (
                <path
                  className={`admintrend-bar${i === at ? " on" : ""}`}
                  d={`M${x},${H} v${-(h - 4)} q0,-4 4,-4 h${barW - 8} q4,0 4,4 v${h - 4} z`}
                />
              )}
              <text x={x + barW / 2} y={H + 13} className="admintrend-x">
                {monthLabel(months[i]).slice(0, 1)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Trends({ trends }: { trends: AdminOverview["trends"] }) {
  const months = trends.map((t) => t.month);
  return (
    <div className="admintrends">
      <Trend title="Sign-ups" months={months} values={trends.map((t) => t.signups)} show={num} />
      <Trend title="Started paying" months={months} values={trends.map((t) => t.upgrades)} show={num} />
      <Trend title="AI requests" months={months} values={trends.map((t) => t.aiRequests)} show={num} />
      <Trend title="AI cost" months={months} values={trends.map((t) => t.aiDollars)} show={money} />
    </div>
  );
}

// How Frank is doing, and which agencies need a look (decided directly,
// 4 Oct 2026). The admin area's home.
export default function AdminOverviewPage() {
  const { data: o, isLoading, error } = useAdminOverview();
  const att = o?.attention;
  const nothingToSee = !!att && Object.values(att).every((list) => (list as unknown[]).length === 0);

  return (
    <>
      <div className="adminhead">
        <div>
          <h1 className="h1">Overview</h1>
          <p className="sub">How Frank is doing, and who needs a look.</p>
        </div>
      </div>
      {isLoading && <p className="sub">Frank is working…</p>}
      {error && <p className="autherr">{errorMessage(error, "Couldn't load the overview")}</p>}
      {o && (
        <>
          <div className="stats adminstats">
            <div className="stat">
              <div className="n">{money(o.revenue.mrr)}</div>
              <div className="l">Monthly revenue</div>
            </div>
            <div className="stat">
              <div className="n">{o.counts.paying}</div>
              <div className="l">Paying workspaces</div>
            </div>
            <div className="stat">
              <div className="n">{o.counts.onTrial}</div>
              <div className="l">On a free trial</div>
            </div>
            <div className="stat">
              <div className="n">{o.signups.week}</div>
              <div className="l">Sign-ups this week</div>
            </div>
            <div className="stat">
              <div className="n">{money(o.ai.month.dollars)}</div>
              <div className="l">AI cost this month</div>
            </div>
            <div className="stat">
              <div className="n">{formatBytes(o.storage.bytes)}</div>
              <div className="l">Files stored, of {formatBytes(o.storage.includedBytes)} included</div>
            </div>
          </div>
          {o.counts.internal > 0 && (
            <p className="msection-d">
              {plural(o.counts.internal, "internal workspace")} left out of these figures, except AI cost (
              <Link href="/admin/agencies?internal=1">see them</Link>).
            </p>
          )}

          <div className="msection-h">Last Six Months</div>
          <p className="msection-d">
            Workspaces signing up and starting to pay, and AI use. AI cost is estimated from the tokens each request
            used, recorded from 1.64 (2 Nov 2026), so earlier months show requests but no cost.
          </p>
          <Trends trends={o.trends} />

          <div className="admincols">
            <div>
              <div className="msection-h">Revenue</div>
              <p className="msection-d">
                Workspaces paying by card, at list price before tax and discounts. A yearly plan counts at its monthly
                rate.
              </p>
              <section className="panel" aria-label="Revenue by plan">
                {o.revenue.byPlan.length === 0 && (
                  <div className="srow">
                    <span className="sl">
                      <span>No one is paying by card yet.</span>
                    </span>
                  </div>
                )}
                {o.revenue.byPlan.map((r) => (
                  <div className="srow" key={r.plan}>
                    <span className="sl">
                      <b>{r.name}</b>
                      <span>{plural(r.agencies, "workspace", "workspaces")}</span>
                    </span>
                    <span className="srow-note">{money(r.mrr)} a month</span>
                  </div>
                ))}
              </section>
              {o.revenue.handSet.length > 0 && (
                <Group
                  title="Plans set by hand"
                  hint="Not through Paddle, so not counted above"
                  items={o.revenue.handSet}
                  note={(a) => a.plan}
                />
              )}

              <div className="msection-h">AI This Month</div>
              <p className="msection-d">
                {money(o.ai.month.dollars)} estimated across {plural(o.ai.month.requests, "request")}
                {o.revenue.mrr > 0 ? `, ${Math.round((o.ai.month.dollars / o.revenue.mrr) * 100)}% of monthly revenue` : ""}
                {o.ai.internalDollars > 0.005 ? `; ${money(o.ai.internalDollars)} of it internal` : ""}.
                {o.ai.month.unpriced > 0 ? ` ${plural(o.ai.month.unpriced, "request")} from before 1.64 can't be priced.` : ""}{" "}
                See <Link href="/admin/guide/costs">Costs and Monitoring</Link>.
              </p>
              {o.ai.byTask.length > 0 && (
                <section className="panel" aria-label="AI by feature">
                  {o.ai.byTask.map((t) => (
                    <div className="srow" key={t.task}>
                      <span className="sl">
                        <b>{t.label}</b>
                        <span>{plural(t.requests, "request")}</span>
                      </span>
                      <span className="srow-note">{t.unpriced === t.requests ? "—" : money(t.dollars)}</span>
                    </div>
                  ))}
                </section>
              )}

              <div className="msection-h">This Month</div>
              <p className="msection-d">
                {plural(o.signups.month, "workspace", "workspaces")} signed up this month, {o.signups.week} this week.{" "}
                {o.counts.agencies} in all, {o.counts.readOnly} read-only after their trial
                {o.counts.paused ? `, ${o.counts.paused} paused` : ""}.
                {o.changes.since
                  ? ` Plan changes are counted from ${day(o.changes.since)}.`
                  : " Plan changes are counted from the first one made."}
              </p>
              <Group
                title="Upgrades"
                hint={String(o.changes.upgrades.length)}
                items={o.changes.upgrades}
                note={(c) => `${c.from} → ${c.to} · ${day(c.at)}`}
              />
              <Group
                title="Downgrades"
                hint={String(o.changes.downgrades.length)}
                items={o.changes.downgrades}
                note={(c) => `${c.from} → ${c.to} · ${day(c.at)}`}
              />
              {o.changes.upgrades.length + o.changes.downgrades.length === 0 && (
                <p className="msection-d">No plan changes this month.</p>
              )}
            </div>

            <div>
              <div className="msection-h">Needs a Look</div>
              <p className="msection-d">
                {nothingToSee ? "Nothing right now." : "Workspaces worth a message or a check."}
              </p>
              {o.emailError && (
                <p className="autherr">
                  Resend didn&rsquo;t answer, so email problems aren&rsquo;t shown: {o.emailError}
                </p>
              )}
              {att && (
                <>
                  <Group
                    title="Plan requests"
                    hint="Waiting for you on the workspace's page"
                    items={att.planRequests}
                    note={(a) => `Wants ${a.plan}, billed ${a.interval}`}
                  />
                  <Group
                    title="Emails not arriving"
                    hint="Resend has stopped sending to these"
                    items={att.emailProblems}
                    note={(a) => a.emails.join(", ")}
                  />
                  <Group
                    title="Failed payments"
                    hint="Paddle is retrying"
                    items={att.failedPayments}
                    note={() => "Payment failed"}
                  />
                  <Group
                    title="Trials ending"
                    hint="In the next 7 days"
                    items={att.trialsEnding}
                    note={(a) => `Ends ${day(a.endsAt)}`}
                  />
                  <Group
                    title="Read-only"
                    hint="Trial over, no plan chosen"
                    items={att.readOnly}
                    note={(a) => `Since ${day(a.endedAt)}`}
                  />
                  <Group
                    title="Cancelling"
                    hint="Drops to Free at period end"
                    items={att.cancelling}
                    note={(a) => `On ${day(a.cancelAt)}`}
                  />
                  <Group
                    title="Near a limit"
                    hint="80% or more used"
                    items={att.nearLimits}
                    note={(a) => a.limits.join(", ")}
                  />
                  <Group
                    title="Gone quiet"
                    hint="No posts, comments or sign-ins in 14 days"
                    items={att.quiet}
                    note={(a) => (a.lastActive ? `Last active ${day(a.lastActive)}` : "Never active")}
                  />
                </>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
