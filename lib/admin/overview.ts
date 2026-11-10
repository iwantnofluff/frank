import type { SupabaseClient } from "@supabase/supabase-js";
import { PLANS, isReadOnly, planById } from "@/lib/plans";
import { planRank } from "@/lib/billing/rules";
import { all, lastSignIns } from "@/lib/admin/people";
import { listSuppressions } from "@/lib/email/resend-api";
import { byTask, lastMonths, monthKey, sumAll, sumBy, type AiFigures, type UsageSummaryRow } from "@/lib/admin/ai-usage";

// The platform admin's overview (decided directly, 4 Oct 2026): how Frank
// is doing, and which agencies need a look. Read with the service role,
// after requirePlatformAdmin(). Nothing is fetched from Paddle: revenue is
// each paying agency's plan at its list price.

const DAY = 24 * 3600_000;
const QUIET_DAYS = 14;
const NEAR = 0.8;

export interface AgencyRef {
  id: string;
  name: string;
  subdomain: string | null;
  // The Primary Owner's email, so two workspaces with one name can be told
  // apart (decided directly, 2 Nov 2026).
  ownerEmail: string | null;
}

// What Supabase's Pro plan includes in file storage (lib: the Guide).
export const STORAGE_INCLUDED_BYTES = 100 * 1024 ** 3;
const TREND_MONTHS = 6;

export interface AdminOverview {
  revenue: {
    // Monthly recurring revenue at list price, from agencies paying through
    // Paddle; a yearly plan counts as its per-month price.
    mrr: number;
    byPlan: { plan: string; name: string; agencies: number; mrr: number }[];
    // On a paid plan set by hand, not through Paddle: not in mrr.
    handSet: (AgencyRef & { plan: string })[];
  };
  // Internal workspaces (phase130) are left out of every figure but these.
  counts: { agencies: number; paying: number; onTrial: number; readOnly: number; paused: number; internal: number };
  // This month's AI, estimated from recorded tokens (phase128). Every
  // workspace, internal ones included: it's the real bill.
  ai: {
    month: AiFigures;
    internalDollars: number;
    byTask: (AiFigures & { task: string; label: string })[];
  };
  // Everything stored, against what the Supabase plan includes.
  storage: { bytes: number; files: number; includedBytes: number };
  // The last six months, oldest first. AI cost only from 1.64.
  trends: { month: string; signups: number; upgrades: number; aiRequests: number; aiDollars: number }[];
  signups: { week: number; month: number };
  changes: {
    // When the record of plan changes began (phase50); null before any.
    since: string | null;
    upgrades: (AgencyRef & { from: string; to: string; at: string })[];
    downgrades: (AgencyRef & { from: string; to: string; at: string })[];
  };
  attention: {
    // Asked of Frank (Enterprise, yearly to monthly, a hand-set plan),
    // not yet applied or declined.
    planRequests: (AgencyRef & { plan: string; interval: string; at: string })[];
    trialsEnding: (AgencyRef & { endsAt: string })[];
    readOnly: (AgencyRef & { endedAt: string | null })[];
    failedPayments: AgencyRef[];
    cancelling: (AgencyRef & { cancelAt: string | null })[];
    nearLimits: (AgencyRef & { limits: string[] })[];
    quiet: (AgencyRef & { lastActive: string | null })[];
    // People whose address Resend has stopped sending to (bounced, spam).
    emailProblems: (AgencyRef & { emails: string[] })[];
  };
  // Resend couldn't be read: emailProblems is empty for that reason.
  emailError: string | null;
}

type Row = Record<string, unknown>;

export async function loadOverview(admin: SupabaseClient, now = Date.now()): Promise<AdminOverview> {
  const monthStart = new Date(now);
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const quietSince = new Date(now - QUIET_DAYS * DAY).toISOString();

  const trendStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - (TREND_MONTHS - 1), 1));
  const [allAgencies, billing, members, clients, aiRows, posts, comments, changes, firstChange, signIns, requests, stored, buckets] =
    await Promise.all([
      all<Row>((f, t) =>
        admin
          .from("agencies")
          .select(
            "id, name, subdomain, plan, trial_ends_at, created_at, suspended_at, seat_limit, client_limit, storage_limit_bytes, ai_monthly_request_cap, is_internal",
          )
          .is("archived_at", null)
          .range(f, t),
      ),
      all<Row>((f, t) =>
        admin
          .from("agency_billing")
          .select("agency_id, paddle_subscription_id, status, billing_interval, cancel_at")
          .range(f, t),
      ),
      all<Row>((f, t) =>
        admin.from("memberships").select("agency_id, user_id, client_id, role").is("removed_at", null).range(f, t),
      ),
      all<Row>((f, t) => admin.from("clients").select("agency_id").is("archived_at", null).eq("is_sample", false).range(f, t)),
      admin.rpc("admin_ai_usage_by_month", { p_since: trendStart.toISOString() }).then((r) => {
        if (r.error) throw new Error(r.error.message);
        return (r.data ?? []) as UsageSummaryRow[];
      }),
      all<Row>((f, t) =>
        admin.from("creatives").select("agency_id, created_at").gte("created_at", quietSince).range(f, t),
      ),
      all<Row>((f, t) =>
        admin.from("comments").select("agency_id, created_at").gte("created_at", quietSince).range(f, t),
      ),
      all<Row>((f, t) =>
        admin
          .from("plan_changes")
          .select("agency_id, from_plan, to_plan, changed_at")
          .gte("changed_at", trendStart.toISOString())
          .order("changed_at", { ascending: false })
          .range(f, t),
      ),
      admin.from("plan_changes").select("changed_at").order("changed_at").limit(1).maybeSingle(),
      lastSignIns(admin),
      all<Row>((f, t) =>
        admin
          .from("plan_requests")
          .select("agency_id, requested_plan, billing_interval, created_at")
          .is("handled_at", null)
          .order("created_at")
          .range(f, t),
      ),
      admin.rpc("admin_storage_by_agency").then((r) => {
        if (r.error) throw new Error(r.error.message);
        return new Map(((r.data ?? []) as { agency_id: string; bytes: number | string }[]).map((x) => [x.agency_id, Number(x.bytes)]));
      }),
      admin.rpc("admin_storage_by_bucket").then((r) => {
        if (r.error) throw new Error(r.error.message);
        return (r.data ?? []) as { bucket: string; bytes: number | string; files: number }[];
      }),
    ]);
  const internalIds = new Set(allAgencies.filter((a) => a.is_internal).map((a) => a.id as string));
  const agencies = allAgencies.filter((a) => !a.is_internal);
  const thisMonth = monthKey(monthStart);
  const aiThisMonth = aiRows.filter((r) => r.month === thisMonth);
  const aiCountOf = sumBy(aiThisMonth, (r) => r.agency_id);

  let emailError: string | null = null;
  const suppressed = await listSuppressions().catch((e: Error) => {
    emailError = e.message;
    return [];
  });
  const userEmails = await all<Row>((f, t) => admin.from("users").select("id, email").range(f, t));
  const blocked = new Set(suppressed.map((s) => s.email.toLowerCase()));
  const emailOf = new Map(userEmails.map((u) => [u.id as string, (u.email as string).toLowerCase()]));

  const ownerOf = new Map(
    members.filter((m) => m.role === "primary_owner").map((m) => [m.agency_id as string, m.user_id as string]),
  );
  const ref = (a: Row): AgencyRef => ({
    id: a.id as string,
    name: a.name as string,
    subdomain: a.subdomain as string | null,
    ownerEmail: emailOf.get(ownerOf.get(a.id as string) ?? "") ?? null,
  });
  const byId = new Map(agencies.map((a) => [a.id as string, a]));
  const billingOf = new Map(billing.map((b) => [b.agency_id as string, b]));
  const count = (rows: Row[], id: string) => rows.filter((r) => r.agency_id === id).length;
  const paysByCard = (id: string) => {
    const b = billingOf.get(id);
    return !!b?.paddle_subscription_id && b.status !== "canceled";
  };

  // Revenue.
  const byPlan = new Map<string, { agencies: number; mrr: number }>();
  const handSet: (AgencyRef & { plan: string })[] = [];
  for (const a of agencies) {
    const plan = planById(a.plan as string);
    if (!plan || plan.id === "free") continue;
    if (!paysByCard(a.id as string)) {
      handSet.push({ ...ref(a), plan: plan.name });
      continue;
    }
    const yearly = billingOf.get(a.id as string)?.billing_interval === "annual";
    const price = (yearly ? plan.annualPerMonth : plan.monthly) ?? 0;
    const row = byPlan.get(plan.id) ?? { agencies: 0, mrr: 0 };
    row.agencies += 1;
    row.mrr += price;
    byPlan.set(plan.id, row);
  }
  const planRows = PLANS.filter((p) => byPlan.has(p.id)).map((p) => ({
    plan: p.id,
    name: p.name,
    ...byPlan.get(p.id)!,
  }));

  // Activity: a post or comment in the last fortnight, or a member signing in.
  const lastActive = new Map<string, string>();
  const touch = (id: string, at: string | null | undefined) => {
    if (at && (!lastActive.has(id) || at > lastActive.get(id)!)) lastActive.set(id, at);
  };
  for (const r of [...posts, ...comments]) touch(r.agency_id as string, r.created_at as string);
  for (const m of members) touch(m.agency_id as string, signIns.get(m.user_id as string) ?? null);

  const attention: AdminOverview["attention"] = {
    planRequests: requests
      .filter((r) => byId.has(r.agency_id as string))
      .map((r) => ({
        ...ref(byId.get(r.agency_id as string)!),
        plan: planById(r.requested_plan as string)?.name ?? (r.requested_plan as string),
        interval: r.billing_interval === "annual" ? "yearly" : "monthly",
        at: r.created_at as string,
      })),
    trialsEnding: [],
    readOnly: [],
    failedPayments: [],
    cancelling: [],
    nearLimits: [],
    quiet: [],
    emailProblems: [],
  };
  let onTrial = 0;
  let readOnly = 0;
  for (const a of agencies) {
    const id = a.id as string;
    const trialEnds = a.trial_ends_at as string | null;
    if (a.plan === "free") {
      if (isReadOnly(a.plan as string, trialEnds, now)) {
        readOnly += 1;
        attention.readOnly.push({ ...ref(a), endedAt: trialEnds });
      } else {
        onTrial += 1;
        if (trialEnds && new Date(trialEnds).getTime() - now <= 7 * DAY)
          attention.trialsEnding.push({ ...ref(a), endsAt: trialEnds });
      }
    }
    const b = billingOf.get(id);
    if (b?.status === "past_due") attention.failedPayments.push(ref(a));
    if (b?.paddle_subscription_id && b.status !== "canceled" && b.cancel_at) {
      attention.cancelling.push({ ...ref(a), cancelAt: b.cancel_at as string });
    }

    const limits: string[] = [];
    const near = (label: string, used: number, limit: unknown, show = (n: number) => String(n)) => {
      if (typeof limit === "number" && limit > 0 && used / limit >= NEAR)
        limits.push(`${label} ${show(used)} of ${show(limit)}`);
    };
    near("Team", members.filter((m) => m.agency_id === id && !m.client_id).length, a.seat_limit);
    near("Clients", count(clients, id), a.client_limit);
    near("Storage", stored.get(id) ?? 0, a.storage_limit_bytes, (n) => `${(n / 1024 ** 3).toFixed(1)} GB`);
    near("AI requests", aiCountOf.get(id)?.requests ?? 0, a.ai_monthly_request_cap);
    if (limits.length) attention.nearLimits.push({ ...ref(a), limits });

    const bounced = [
      ...new Set(
        members
          .filter((m) => m.agency_id === id)
          .map((m) => emailOf.get(m.user_id as string))
          .filter((e): e is string => !!e && blocked.has(e)),
      ),
    ];
    if (bounced.length) attention.emailProblems.push({ ...ref(a), emails: bounced });

    // Quiet: nothing in a fortnight, and old enough to have started.
    const active = lastActive.get(id) ?? null;
    const startedAgo = now - new Date(a.created_at as string).getTime();
    if (!a.suspended_at && startedAgo > 3 * DAY && (!active || active < quietSince)) {
      attention.quiet.push({ ...ref(a), lastActive: active });
    }
  }
  attention.trialsEnding.sort((x, y) => x.endsAt.localeCompare(y.endsAt));

  const upgrades: AdminOverview["changes"]["upgrades"] = [];
  const downgrades: AdminOverview["changes"]["downgrades"] = [];
  for (const c of changes.filter((c) => (c.changed_at as string) >= monthStart.toISOString())) {
    const a = byId.get(c.agency_id as string);
    if (!a) continue;
    const item = {
      ...ref(a),
      from: planById(c.from_plan as string)?.name ?? (c.from_plan as string),
      to: planById(c.to_plan as string)?.name ?? (c.to_plan as string),
      at: c.changed_at as string,
    };
    (planRank(c.to_plan as string) > planRank(c.from_plan as string) ? upgrades : downgrades).push(item);
  }

  const created = (since: number) => agencies.filter((a) => new Date(a.created_at as string).getTime() >= since).length;

  const aiByMonth = sumBy(
    aiRows.filter((r) => !internalIds.has(r.agency_id)),
    (r) => r.month,
  );
  const trends = lastMonths(TREND_MONTHS, now).map((month) => ({
    month,
    signups: agencies.filter((a) => monthKey(new Date(a.created_at as string)) === month).length,
    // Into a paid plan from Free: a workspace starting to pay.
    upgrades: changes.filter(
      (c) =>
        byId.has(c.agency_id as string) &&
        c.from_plan === "free" &&
        c.to_plan !== "free" &&
        monthKey(new Date(c.changed_at as string)) === month,
    ).length,
    aiRequests: aiByMonth.get(month)?.requests ?? 0,
    aiDollars: aiByMonth.get(month)?.dollars ?? 0,
  }));

  return {
    revenue: { mrr: planRows.reduce((n, r) => n + r.mrr, 0), byPlan: planRows, handSet },
    counts: {
      agencies: agencies.length,
      paying: planRows.reduce((n, r) => n + r.agencies, 0),
      onTrial,
      readOnly,
      paused: agencies.filter((a) => a.suspended_at).length,
      internal: internalIds.size,
    },
    ai: {
      month: sumAll(aiThisMonth),
      internalDollars: sumAll(aiThisMonth.filter((r) => internalIds.has(r.agency_id))).dollars,
      byTask: byTask(aiThisMonth),
    },
    storage: {
      bytes: buckets.reduce((n, b) => n + Number(b.bytes), 0),
      files: buckets.reduce((n, b) => n + b.files, 0),
      includedBytes: STORAGE_INCLUDED_BYTES,
    },
    trends,
    signups: { week: created(now - 7 * DAY), month: created(monthStart.getTime()) },
    changes: {
      since: (firstChange.data?.changed_at as string | undefined) ?? null,
      upgrades,
      downgrades,
    },
    attention,
    emailError,
  };
}
