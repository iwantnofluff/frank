"use client";

import Link from "next/link";
import { useAdminOverview } from "@/hooks/use-admin-overview";
import type { AgencyRef } from "@/lib/admin/overview";
import { errorMessage } from "@/lib/errors";

const day = (value: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "never";
const money = (n: number) => `$${n.toLocaleString()}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// One agency in a list: its name and address, opening its page; a note on
// the right.
function AgencyRow({ agency, note }: { agency: AgencyRef; note: React.ReactNode }) {
  return (
    <div className="srow">
      <span className="sl">
        <Link href={`/admin/agencies/${agency.id}`} className="admintbl-name">
          {agency.name}
        </Link>
        {agency.subdomain && <span>{agency.subdomain}</span>}
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
      {isLoading && <p className="sub">Loading…</p>}
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
              <div className="l">Paying agencies</div>
            </div>
            <div className="stat">
              <div className="n">{o.counts.onTrial}</div>
              <div className="l">On a free trial</div>
            </div>
            <div className="stat">
              <div className="n">{o.signups.week}</div>
              <div className="l">Sign-ups this week</div>
            </div>
          </div>

          <div className="admincols">
            <div>
              <div className="msection-h">Revenue</div>
              <p className="msection-d">
                Agencies paying by card, at list price before tax and discounts. A yearly plan counts at its monthly
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
                      <span>{plural(r.agencies, "agency", "agencies")}</span>
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

              <div className="msection-h">This month</div>
              <p className="msection-d">
                {plural(o.signups.month, "agency", "agencies")} signed up this month, {o.signups.week} this week.{" "}
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
              <div className="msection-h">Needs a look</div>
              <p className="msection-d">
                {nothingToSee ? "Nothing right now." : "Agencies worth a message or a check."}
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
                    hint="Waiting for you on the agency's page"
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
