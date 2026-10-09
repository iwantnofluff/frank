"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { SettingsHead } from "@/components/settings/SettingsHead";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { useAnalytics } from "@/hooks/use-analytics";
import { computeAnalytics, contractDelivery, filterPosts, groupAnalytics, weeklyTrends, DAY_MS, LATE_SEND_DAYS, type AnalyticsFilters, type ContractRow, type GroupRow, type WeekRow } from "@/lib/analytics";
import { ISSUE_CATEGORIES } from "@/lib/ai/build-classify-comment-prompt";
import { formatById } from "@/lib/formats";
import { seesAllClients } from "@/lib/roles";
import { errorMessage } from "@/lib/errors";
import { Explain } from "@/components/settings/Explain";
import type { ExplainKey } from "@/lib/analytics-explain";

// Settings → Analytics (direct instruction, phase71): how the work moves
// from concept to approval, what holds it up, and how feedback comes in,
// by client, project, person, format and period. Owners and Admins only.
// To become the homepage later.

const PERIODS = [
  { id: "30", label: "Last 30 days", days: 30 },
  { id: "90", label: "Last 90 days", days: 90 },
  { id: "365", label: "Last 12 months", days: 365 },
  { id: "all", label: "All time", days: null },
] as const;

const fmtDays = (n: number | null) => (n === null ? "—" : `${n < 10 ? n.toFixed(1) : Math.round(n)} days`);
const fmtPct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const fmtNum = (n: number | null) => (n === null ? "—" : n.toFixed(1));
const categoryLabel = (k: string) => ISSUE_CATEGORIES.find((c) => c.key === k)?.label ?? k;
const formatLabel = (k: string) => formatById(k)?.label ?? k;
const weeks = (days: number) => `${days / 7} weeks`;
const dayMonth = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default function AnalyticsPage() {
  const { data: agency } = useMyAgency();
  const { data: me, isLoading: meLoading } = useMyMembership(agency?.agencyId);
  const isAdmin = !!me && !me.client_id && seesAllClients(me.role);
  // "Now" is when the data was read, so the page stays the same between renders.
  const { data, isLoading, error, dataUpdatedAt } = useAnalytics(isAdmin);

  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [personId, setPersonId] = useState("");
  const [format, setFormat] = useState("");
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("90");

  const view = useMemo(() => {
    if (!data) return null;
    const days = PERIODS.find((p) => p.id === period)!.days;
    const filters: AnalyticsFilters = {
      clientId: clientId || undefined,
      projectId: projectId || undefined,
      personId: personId || undefined,
      format: format || undefined,
      since: days ? new Date(dataUpdatedAt - days * DAY_MS).toISOString() : null,
    };
    const posts = filterPosts(data.posts, filters);
    const now = new Date(dataUpdatedAt);
    // Each client's promise (phase72), 28 days unless set.
    const lead = (clientId: string) => data.leadDays[clientId] ?? 28;
    return {
      a: computeAnalytics(posts, data.events, data.versions, data.comments, now, lead),
      byClient: groupAnalytics(posts, (p) => p.clientId, data.events, data.versions, data.comments, now, lead),
      byProject: groupAnalytics(posts, (p) => p.projectId, data.events, data.versions, data.comments, now, lead),
      byPerson: groupAnalytics(posts, (p) => p.personId, data.events, data.versions, data.comments, now, lead),
      weeks: weeklyTrends(posts, data.events, now, 12),
      // By calendar month, so the period filter doesn't apply; the rest do.
      contract: contractDelivery(filterPosts(data.posts, { ...filters, since: null }), (c) => data.contracts[c] ?? null, now, 6),
    };
  }, [data, dataUpdatedAt, clientId, projectId, personId, format, period]);

  const formats = useMemo(() => [...new Set((data?.posts ?? []).flatMap((p) => p.formats))].sort(), [data]);
  const nameOf = (list: { id: string; name: string }[] | undefined, id: string) => list?.find((x) => x.id === id)?.name ?? "—";

  return (
    <div className="pad analytics">
      <SettingsHead
        title="Analytics"
        description="How the work moves from concept to approval, and what holds it up. For Owners and Admins."
      />
      {meLoading && <p className="sub">Frank is working…</p>}
      {!meLoading && !isAdmin && <p className="note">Only Owners and Admins can see Analytics.</p>}
      {isAdmin && (
        <>
          <div className="an-filters">
            <Pick label="Client" value={clientId} onChange={(v) => { setClientId(v); setProjectId(""); }}>
              <option value="">All clients</option>
              {data?.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Pick>
            <Pick label="Project" value={projectId} onChange={setProjectId}>
              <option value="">All projects</option>
              {data?.projects.filter((p) => !clientId || p.clientId === clientId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Pick>
            <Pick label="Person" value={personId} onChange={setPersonId}>
              <option value="">Everyone</option>
              {data?.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Pick>
            <Pick label="Format" value={format} onChange={setFormat}>
              <option value="">All formats</option>
              {formats.map((f) => <option key={f} value={f}>{formatLabel(f)}</option>)}
            </Pick>
            <Pick label="Period" value={period} onChange={(v) => setPeriod(v as typeof period)}>
              {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </Pick>
          </div>

          {isLoading && <p className="sub">Frank is working…</p>}
          {error && <p className="autherr">{errorMessage(error, "Couldn't load Analytics")}</p>}
          {view && view.a.posts === 0 && <p className="note">No posts match these filters.</p>}
          {view && view.a.posts > 0 && (
            <>
              <Section title="Our promise" sub="How far ahead of going live posts reach the client">
                <div className="stats">
                  <Stat n={fmtDays(view.a.promise.medianDaysAhead)} k="sentAhead" l="Sent before going live" hint={`Median, ${view.a.promise.sent} posts sent`} />
                  <Stat
                    n={fmtPct(view.a.promise.metShare)}
                    k="promiseMet" l="Met the client's promise"
                    hint={clientId ? `Their promise: ${weeks(data?.leadDays[clientId] ?? 28)}` : "Each post against its own client's promise"}
                  />
                  <Stat n={String(view.a.promise.lateSends.length)} k="lateSends" l={`Late sends`} hint={`Under ${LATE_SEND_DAYS} days to go`} />
                  <Stat n={fmtDays(view.a.promise.medianDaysPlanned)} k="plannedAhead" l="Planned ahead" hint="Created to live, median" />
                </div>
                <p className="an-note">
                  Sent means first reaching Client Review, recorded from 8 October 2026. Planned ahead covers every post with a live date.
                </p>
                {view.a.promise.lateSends.length > 0 && (
                  <>
                    <h3 className="an-h">
                      <Explain as="span" k="lateSends" title="Late sends">Late sends</Explain>
                    </h3>
                    <ul className="an-list">
                      {view.a.promise.lateSends.slice(0, 8).map((r) => (
                        <li key={r.id}>
                          <span>
                            <Link href={`/creatives/${r.id}`}>{r.name}</Link> · {nameOf(data?.clients, r.clientId)}
                          </span>
                          <span className="an-late">
                            Sent {dayMonth(r.sentAt)}, live {dayMonth(r.scheduledAt)}:{" "}
                            {r.daysAhead < 0 ? "after going live" : `${fmtDays(r.daysAhead)} to approve`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Section>

              <Section title="Contract delivery" sub="Approved posts going live each month, against the posts a month in each client's contract">
                <Contract rows={view.contract} name={(id) => nameOf(data?.clients, id)} />
              </Section>

              <Section title="Ball in court" sub="Who the work is waiting on right now">
                <div className="an-cols">
                  <Court k="waitingOnUs" title="Waiting on us" rows={view.a.court.onUs} />
                  <Court k="waitingOnClient" title="Waiting on the client" rows={view.a.court.onClient} />
                </div>
              </Section>

              <Section title="Speed" sub={`${view.a.posts} posts, ${view.a.approved} approved`}>
                <div className="stats">
                  <Stat n={fmtDays(view.a.speed.medianDaysToApproval)} k="toApproval" l="Created to approved" hint="Median, approved posts" />
                  <Stat n={fmtDays(view.a.speed.medianDaysInStage.concept)} k="inConcept" l="In Concept" />
                  <Stat n={fmtDays(view.a.speed.medianDaysInStage.internal)} k="inInternal" l="In Internal Review" />
                  <Stat n={fmtDays(view.a.speed.medianDaysInStage.client)} k="inClient" l="In Client Review" />
                  <Stat n={fmtPct(view.a.speed.approvedOnTime)} k="approvedBeforeLive" l="Approved before going live" />
                </div>
                <p className="an-note">
                  Time in each stage counts from 8 October 2026, when Frank began recording every stage change.
                </p>
                {view.a.speed.atRisk.length > 0 && (
                  <>
                    <h3 className="an-h">At risk: live within 7 days, not approved</h3>
                    <ul className="an-list">
                      {view.a.speed.atRisk.slice(0, 8).map((r) => (
                        <li key={r.id}>
                          <Link href={`/creatives/${r.id}`}>{r.name}</Link>
                          <span className={r.overdue ? "an-late" : ""}>
                            {r.overdue ? `Was due ${dayMonth(r.scheduledAt)}` : `Live ${dayMonth(r.scheduledAt)}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Section>

              <Section title="Quality" sub="How many rounds it takes to get to yes">
                <div className="stats">
                  <Stat n={fmtNum(view.a.quality.avgCreativeRounds)} k="artworkVersions" l="Artwork versions" hint="Average, approved posts" />
                  <Stat n={fmtNum(view.a.quality.avgCopyRounds)} k="copyVersions" l="Copy versions" hint="Average, approved posts" />
                  <Stat n={fmtPct(view.a.quality.firstTimeRight)} k="firstTime" l="Approved first time" hint="One version each, no changes asked" />
                  <Stat n={fmtPct(view.a.quality.changesRequestedShare)} k="changesRequested" l="Changes requested" hint={`${view.a.quality.changesRequestedPosts} ${view.a.quality.changesRequestedPosts === 1 ? "post" : "posts"}`} />
                </div>
              </Section>

              <Section title="Accountability" sub="Turnaround, timing and changes, on both sides">
                <div className="stats">
                  <Stat
                    n={view.a.accountability.medianTurnaroundHours === null ? "—" : `${Math.round(view.a.accountability.medianTurnaroundHours)} h`}
                    k="turnaround" l="Our turnaround"
                    hint="Client comment to our reply or new version"
                  />
                  <Stat n={String(view.a.accountability.lastMinuteApprovals)} k="lastMinute" l="Last-minute approvals" hint="Under 48 hours to go" />
                  <Stat n={String(view.a.accountability.approvedAfterLive)} k="afterLive" l="Approved after going live" />
                  <Stat n={String(view.a.accountability.missedLive)} k="missedLive" l="Missed live dates" hint="Live date passed, not approved" />
                  <Stat
                    k="rework"
                    n={String(view.a.accountability.rework.artwork + view.a.accountability.rework.copy)}
                    l="Rework"
                    hint={`Extra versions: ${view.a.accountability.rework.artwork} artwork, ${view.a.accountability.rework.copy} copy, on ${view.a.accountability.rework.posts} ${view.a.accountability.rework.posts === 1 ? "post" : "posts"}`}
                  />
                  <Stat n={String(view.a.accountability.scopeChanges)} k="scopeChanges" l="Scope changes" hint="From the client's feedback" />
                </div>
              </Section>

              <Section title="Trends" sub="The last 12 weeks, by week">
                <Trends weeks={view.weeks} />
              </Section>

              <Section title="Feedback" sub={`${view.a.feedback.comments} comments`}>
                <div className="stats">
                  <Stat n={String(view.a.feedback.clientSide)} k="fromClient" l="From the client" />
                  <Stat n={String(view.a.feedback.agencySide)} k="fromTeam" l="From the team" />
                  <Stat n={String(view.a.feedback.unresolved)} k="unresolved" l="Unresolved" hint={
                      view.a.feedback.oldestUnresolvedDays === null
                        ? undefined
                        : view.a.feedback.oldestUnresolvedDays < 1
                          ? "Oldest under a day"
                          : `Oldest ${fmtDays(view.a.feedback.oldestUnresolvedDays)}`
                    } />
                  <Stat n={fmtDays(view.a.feedback.medianDaysToResolve)} k="toResolve" l="To resolve" hint="Median" />
                </div>
                <div className="an-cols">
                  <div>
                    <h3 className="an-h">
                      <Explain as="span" k="categories" title="What the feedback is about">What the feedback is about</Explain>
                    </h3>
                    <Bars rows={view.a.feedback.byCategory.map((c) => ({ label: categoryLabel(c.category), value: c.count }))} />
                  </div>
                  <div>
                    <h3 className="an-h">
                      <Explain as="span" k="mood" title="Mood">Mood</Explain>
                    </h3>
                    <Bars
                      rows={[
                        { label: "Positive", value: view.a.feedback.sentiment.positive, tone: "good" },
                        { label: "Neutral", value: view.a.feedback.sentiment.neutral },
                        { label: "Negative", value: view.a.feedback.sentiment.negative, tone: "bad" },
                      ]}
                    />
                    {view.a.feedback.sentiment.unscored > 0 && (
                      <p className="an-note">
                        {view.a.feedback.sentiment.unscored === 1 ? "1 earlier comment has" : `${view.a.feedback.sentiment.unscored} earlier comments have`} no
                        mood: it&apos;s read from 8 October 2026.
                      </p>
                    )}
                  </div>
                </div>
                {view.a.feedback.repeats.length > 0 && (
                  <>
                    <h3 className="an-h">
                      <Explain as="span" k="repeats" title="Repeat issues">Repeat issues</Explain>
                    </h3>
                    <ul className="an-list">
                      {view.a.feedback.repeats.map((r) => (
                        <li key={`${r.clientId}${r.format}${r.category}`}>
                          <span>
                            <b>{categoryLabel(r.category)}</b> · {nameOf(data?.clients, r.clientId)} · {formatLabel(r.format)}
                          </span>
                          <span>{r.count} times</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Section>

              <Section title="Clients" sub="Who's quick to approve, and who asks for the most changes">
                <GroupTable
                  rows={view.byClient}
                  name={(id) => nameOf(data?.clients, id)}
                  first="Client"
                  promise={(id) => weeks(data?.leadDays[id] ?? 28)}
                />
              </Section>
              <Section title="Projects" sub="The same, project by project">
                <GroupTable rows={view.byProject} name={(id) => nameOf(data?.projects, id)} first="Project" />
              </Section>
              <Section title="People" sub="By who leads each post (or made it, without a lead)">
                <GroupTable rows={view.byPerson} name={(id) => nameOf(data?.people, id)} first="Person" />
              </Section>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Pick({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <label className="an-pick">
      <span>{label}</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </label>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="an-sec">
      <div className="an-sec-h">
        <h2>{title}</h2>
        {sub && <span>{sub}</span>}
      </div>
      {children}
    </section>
  );
}

// `k`: its explanation, shown on hover (direct instruction).
function Stat({ k, n, l, hint }: { k: ExplainKey; n: string; l: string; hint?: string }) {
  return (
    <Explain k={k} title={l} className="stat">
      <div className="n">{n}</div>
      <div className="l">{l}</div>
      {hint && <div className="an-hint">{hint}</div>}
    </Explain>
  );
}

// A table's column heading, explained on hover.
function Th({ k, children }: { k: ExplainKey; children: string }) {
  return (
    <Explain as="th" k={k} title={children}>
      {children}
    </Explain>
  );
}

function Bars({ rows }: { rows: { label: string; value: number; tone?: "good" | "bad" }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.some((r) => r.value)) return <p className="an-note">Nothing yet.</p>;
  return (
    <div className="an-bars">
      {rows.map((r) => (
        <div className="an-bar" key={r.label}>
          <span className="an-bar-l">{r.label}</span>
          <span className="an-bar-t">
            <i className={r.tone ?? ""} style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="an-bar-n">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

// `promise`: each client's own promise, shown beside whether it was met.
function GroupTable({
  rows,
  name,
  first,
  promise,
}: {
  rows: GroupRow[];
  name: (id: string) => string;
  first: string;
  promise?: (id: string) => string;
}) {
  return (
    <div className="an-tablewrap">
      <table className="admintbl an-table">
        <thead>
          <tr>
            <th>{first}</th>
            <Th k="posts">Posts</Th>
            <Th k="approved">Approved</Th>
            <Th k="toApproval">To approval</Th>
            <Th k="inClient">In Client Review</Th>
            <Th k="artworkVersions">Artwork versions</Th>
            <Th k="firstTime">First time</Th>
            <Th k="changesRequested">Changes asked</Th>
            <Th k="clientComments">Client comments</Th>
            <Th k="negative">Negative</Th>
            <Th k="sentAhead">Sent ahead</Th>
            {promise && <Th k="promise">Promise</Th>}
            <Th k="promiseMet">Promise met</Th>
            <Th k="lateSends">Late sends</Th>
            <Th k="turnaround">Our turnaround</Th>
            <Th k="scopeChanges">Scope changes</Th>
            <Th k="rework">Rework</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{name(r.id)}</td>
              <td>{r.posts}</td>
              <td>{r.approved}</td>
              <td>{fmtDays(r.medianDaysToApproval)}</td>
              <td>{fmtDays(r.medianDaysInClientReview)}</td>
              <td>{fmtNum(r.avgCreativeRounds)}</td>
              <td>{fmtPct(r.firstTimeRight)}</td>
              <td>{fmtPct(r.changesRequestedShare)}</td>
              <td>{r.clientComments}</td>
              <td>{fmtPct(r.negativeShare)}</td>
              <td>{fmtDays(r.medianDaysAhead)}</td>
              {promise && <td>{promise(r.id)}</td>}
              <td>{fmtPct(r.metShare)}</td>
              <td className={r.lateSends ? "an-late" : ""}>{r.lateSends}</td>
              <td>{r.medianTurnaroundHours === null ? "—" : `${Math.round(r.medianTurnaroundHours)} h`}</td>
              <td>{r.scopeChanges}</td>
              <td>{r.rework}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Court({ k, title, rows }: { k: ExplainKey; title: string; rows: { id: string; name: string; days: number }[] }) {
  return (
    <div>
      <h3 className="an-h">
        <Explain as="span" k={k} title={title}>
          {title} <span className="an-count">{rows.length}</span>
        </Explain>
      </h3>
      {rows.length === 0 ? (
        <p className="an-note">Nothing.</p>
      ) : (
        <ul className="an-list">
          {rows.slice(0, 6).map((r) => (
            <li key={r.id}>
              <Link href={`/creatives/${r.id}`}>{r.name}</Link>
              <span className={r.days >= 3 ? "an-late" : ""}>{r.days < 1 ? "Today" : fmtDays(r.days)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Each measure as a row of 12 weekly columns (Monday to Sunday, the last
// this week so far), every week's number written on its bar and every week
// labelled (direct instruction: the chart needs to read on its own). One
// colour: the bars only show size.
function Trends({ weeks }: { weeks: WeekRow[] }) {
  const series: { label: string; about: string; value: (w: WeekRow) => number | null; show: (n: number) => string }[] = [
    { label: "Approvals", about: "Posts approved that week", value: (w) => w.approvals, show: (n) => String(n) },
    { label: "Days to approval", about: "Median, created to approved, for that week's approvals", value: (w) => w.medianDaysToApproval, show: (n) => n.toFixed(1) },
    { label: "Days sent ahead", about: "Median days before going live, for posts sent to the client that week", value: (w) => w.medianDaysAhead, show: (n) => n.toFixed(1) },
    { label: "Late sends", about: `Posts sent that week with under ${LATE_SEND_DAYS} days to go`, value: (w) => w.lateSends, show: (n) => String(n) },
  ];
  return (
    <div className="an-trends">
      <div className="an-trend an-trend-axis">
        <span className="an-trend-l">Week of</span>
        <div className="an-trend-cols">
          {weeks.map((w, i) => (
            <span key={w.start} className="an-trend-wk">
              {i === weeks.length - 1 ? "This week" : dayMonth(w.start)}
            </span>
          ))}
        </div>
      </div>
      {series.map((s) => {
        const values = weeks.map(s.value);
        const max = Math.max(1, ...values.map((v) => v ?? 0));
        return (
          <div className="an-trend" key={s.label}>
            <span className="an-trend-l">
              <b>{s.label}</b>
              <small>{s.about}</small>
            </span>
            <div className="an-trend-cols">
              {weeks.map((w, i) => {
                const v = values[i];
                return (
                  <span key={w.start} className="an-trend-col" title={`Week of ${dayMonth(w.start)}: ${v === null ? "none" : s.show(v)}`}>
                    <em>{v === null || v === 0 ? "–" : s.show(v)}</em>
                    <i style={{ height: `${((v ?? 0) / max) * 100}%` }} />
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const monthName = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });

// Delivered against the contract (phase73): this month and last across the
// clients shown, then each client month by month, short months in red.
function Contract({ rows, name }: { rows: ContractRow[]; name: (id: string) => string }) {
  if (!rows.length) {
    return <p className="note">No client has a contract set. Add its posts a month in Client Settings → Preferences.</p>;
  }
  const total = (i: number, k: "delivered" | "planned") => rows.reduce((n, r) => n + r.months[i][k], 0);
  const contracted = rows.reduce((n, r) => n + r.contract, 0);
  const last = rows[0].months.length - 1;
  return (
    <>
      <div className="stats">
        <Stat n={`${total(last, "delivered")} of ${contracted}`} k="contractApproved" l="Approved this month" hint="Going live this month" />
        <Stat n={`${total(last, "planned")} of ${contracted}`} k="contractPlanned" l="Planned this month" hint="Every stage" />
        <Stat n={`${total(last - 1, "delivered")} of ${contracted}`} k="contractLastMonth" l="Delivered last month" />
      </div>
      <p className="an-note">Red: fewer approved than the contract. Months before a client&apos;s posts were planned in Frank show 0.</p>
      <div className="an-tablewrap">
        <table className="admintbl an-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>A month</th>
              {rows[0].months.map((m, i) => (
                <th key={m.month}>{i === last ? "This month" : monthName(m.month)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.clientId}>
                <td>{name(r.clientId)}</td>
                <td>{r.contract}</td>
                {r.months.map((m, i) => (
                  <td key={m.month} className={i < last && m.delivered < r.contract ? "an-late" : ""}>
                    {m.delivered}
                    {i === last && <span className="an-sub"> · {m.planned} planned</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
