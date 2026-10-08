// Analytics (direct instruction, phase71): how long posts take from concept
// to approval, what holds them up, and how feedback comes in, for the
// agency's Owners and Admins. Pure functions over rows Frank already reads,
// so every number here is unit-tested (lib/analytics.test.ts) apart from
// the page that shows them.

export const DAY_MS = 86_400_000;

export interface APost {
  id: string;
  name: string;
  projectId: string;
  clientId: string;
  formats: string[];
  // Who leads it, else who created it.
  personId: string | null;
  stage: number;
  createdAt: string;
  approvedAt: string | null;
  scheduledAt: string | null;
}
export interface AEvent {
  creativeId: string;
  fromStage: number | null;
  toStage: number;
  exception: string | null;
  at: string;
}
export interface AVersion {
  creativeId: string;
  kind: "creative" | "copy";
  createdAt: string;
}
export interface AComment {
  creativeId: string;
  clientSide: boolean;
  category: string | null;
  sentiment: "positive" | "neutral" | "negative" | null;
  createdAt: string;
  resolvedAt: string | null;
  // A reply in a thread, not a thread of its own.
  isReply: boolean;
}

export interface AnalyticsFilters {
  clientId?: string;
  projectId?: string;
  personId?: string;
  format?: string;
  // Posts created on or after this.
  since?: string | null;
}

export function filterPosts(posts: APost[], f: AnalyticsFilters): APost[] {
  return posts.filter(
    (p) =>
      (!f.clientId || p.clientId === f.clientId) &&
      (!f.projectId || p.projectId === f.projectId) &&
      (!f.personId || p.personId === f.personId) &&
      (!f.format || p.formats.includes(f.format)) &&
      (!f.since || p.createdAt >= f.since),
  );
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const days = (from: string, to: string) => (new Date(to).getTime() - new Date(from).getTime()) / DAY_MS;
const pct = (part: number, whole: number) => (whole ? part / whole : null);

// Days a post spent in each stage it has left, in all: the time between one
// move and the next, added up per stage (Changes Requested is a move within
// Client Review, and going back to a stage counts again). A move with no
// "from" after the first is a filled-in starting point for an older post
// (phase71), not a real move, so no time is counted across it.
export function stageDurations(events: AEvent[]): Record<number, number[]> {
  const total: Record<number, number> = {};
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
  for (let i = 0; i < sorted.length - 1; i++) {
    const here = sorted[i];
    const next = sorted[i + 1];
    if (next.fromStage === null) continue;
    total[here.toStage] = (total[here.toStage] ?? 0) + days(here.at, next.at);
  }
  return Object.fromEntries(Object.entries(total).map(([stage, t]) => [stage, [t]]));
}

// A post's first time with the client: when it first reached Client Review.
export function firstSentAt(events: AEvent[]): string | null {
  const sent = events.filter((e) => e.toStage === 3).map((e) => e.at).sort();
  return sent[0] ?? null;
}

// Late: sent to the client with under this many days to go (decided
// directly, phase72).
export const LATE_SEND_DAYS = 7;

export interface Analytics {
  posts: number;
  approved: number;
  // The "made ahead" promise (phase72): how long before going live a post
  // first reached the client, against each client's promise.
  promise: {
    sent: number; // posts with a live date that have been to the client
    medianDaysAhead: number | null;
    metShare: number | null;
    lateSends: { id: string; name: string; clientId: string; sentAt: string; scheduledAt: string; daysAhead: number }[];
    // Planning, for every post with a live date: created to live.
    medianDaysPlanned: number | null;
    plannedMetShare: number | null;
  };
  // Who the work is waiting on right now (posts not yet approved).
  court: {
    onUs: { id: string; name: string; days: number }[];
    onClient: { id: string; name: string; days: number }[];
  };
  accountability: {
    medianTurnaroundHours: number | null; // client comment → the team's next comment or version
    lastMinuteApprovals: number; // approved within 48 hours before going live
    approvedAfterLive: number;
    missedLive: number; // live date passed, not approved
    rework: number; // moved back out of Approved
    scopeChanges: number;
  };
  speed: {
    medianDaysToApproval: number | null;
    medianDaysInStage: { concept: number | null; internal: number | null; client: number | null };
    approvedOnTime: number | null; // share of approved posts with a live date, approved by it
    atRisk: { id: string; name: string; scheduledAt: string; overdue: boolean }[];
  };
  quality: {
    avgCreativeRounds: number | null;
    avgCopyRounds: number | null;
    firstTimeRight: number | null; // share of approved posts: one version each, no changes asked
    changesRequestedPosts: number;
    changesRequestedShare: number | null;
  };
  feedback: {
    comments: number;
    clientSide: number;
    agencySide: number;
    byCategory: { category: string; count: number }[];
    sentiment: { positive: number; neutral: number; negative: number; unscored: number };
    unresolved: number;
    oldestUnresolvedDays: number | null;
    medianDaysToResolve: number | null;
    repeats: { clientId: string; format: string; category: string; count: number }[];
  };
}

export function computeAnalytics(
  posts: APost[],
  events: AEvent[],
  versions: AVersion[],
  comments: AComment[],
  now: Date = new Date(),
  // Each client's promise in days (phase72), 28 unless set.
  leadDaysOf: (clientId: string) => number = () => 28,
): Analytics {
  const ids = new Set(posts.map((p) => p.id));
  const byPost = <T extends { creativeId: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) if (ids.has(r.creativeId)) (m.get(r.creativeId) ?? m.set(r.creativeId, []).get(r.creativeId)!).push(r);
    return m;
  };
  const eventsOf = byPost(events);
  const versionsOf = byPost(versions);
  const theComments = comments.filter((c) => ids.has(c.creativeId));
  const approved = posts.filter((p) => p.stage >= 4 && p.approvedAt);
  const nowIso = now.toISOString();

  // Speed
  const stageTimes: Record<number, number[]> = {};
  for (const p of posts) {
    for (const [stage, list] of Object.entries(stageDurations(eventsOf.get(p.id) ?? []))) {
      (stageTimes[Number(stage)] ??= []).push(...list);
    }
  }
  const dated = approved.filter((p) => p.scheduledAt);
  const soon = new Date(now.getTime() + 7 * DAY_MS).toISOString();
  const atRisk = posts
    .filter((p) => p.stage < 4 && p.scheduledAt && p.scheduledAt <= soon)
    .sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!))
    .map((p) => ({ id: p.id, name: p.name, scheduledAt: p.scheduledAt!, overdue: p.scheduledAt! < nowIso }));

  // Quality
  const rounds = (p: APost, kind: "creative" | "copy") => (versionsOf.get(p.id) ?? []).filter((v) => v.kind === kind).length;
  const askedChanges = (p: APost) => (eventsOf.get(p.id) ?? []).some((e) => e.exception === "changes_requested");
  const changed = posts.filter(askedChanges);
  const firstTime = approved.filter((p) => rounds(p, "creative") <= 1 && rounds(p, "copy") <= 1 && !askedChanges(p));

  // Feedback
  const threads = theComments.filter((c) => !c.isReply);
  const unresolved = threads.filter((c) => !c.resolvedAt);
  const categories = new Map<string, number>();
  for (const c of theComments) if (c.category) categories.set(c.category, (categories.get(c.category) ?? 0) + 1);
  const postOf = new Map(posts.map((p) => [p.id, p]));
  const repeatKey = new Map<string, { clientId: string; format: string; category: string; count: number }>();
  for (const c of theComments) {
    if (!c.category || c.category === "no_issue") continue;
    const p = postOf.get(c.creativeId)!;
    const format = p.formats[0] ?? "";
    const k = `${p.clientId}|${format}|${c.category}`;
    const r = repeatKey.get(k) ?? { clientId: p.clientId, format, category: c.category, count: 0 };
    r.count++;
    repeatKey.set(k, r);
  }

  // The promise
  const withLive = posts.filter((p) => p.scheduledAt);
  const sends = withLive
    .map((p) => {
      const sentAt = firstSentAt(eventsOf.get(p.id) ?? []);
      return sentAt ? { p, sentAt, daysAhead: days(sentAt, p.scheduledAt!) } : null;
    })
    .filter((x): x is { p: APost; sentAt: string; daysAhead: number } => !!x);
  const planned = withLive.map((p) => ({ p, ahead: days(p.createdAt, p.scheduledAt!) }));

  // Ball in court: the client has it from reaching Client Review until they
  // ask for changes or it moves on; otherwise it's with the team.
  const onUs: { id: string; name: string; days: number }[] = [];
  const onClient: { id: string; name: string; days: number }[] = [];
  for (const p of posts) {
    if (p.stage >= 4) continue;
    const ev = [...(eventsOf.get(p.id) ?? [])].sort((a, b) => a.at.localeCompare(b.at));
    const last = ev[ev.length - 1];
    const since = last?.at ?? p.createdAt;
    const row = { id: p.id, name: p.name, days: days(since, nowIso) };
    if (p.stage === 3 && last?.exception !== "changes_requested") onClient.push(row);
    else onUs.push(row);
  }
  onUs.sort((a, b) => b.days - a.days);
  onClient.sort((a, b) => b.days - a.days);

  // The team's turnaround on the client's feedback.
  const versionTimes = new Map<string, string[]>();
  for (const [id, list] of versionsOf) versionTimes.set(id, list.map((v) => v.createdAt).sort());
  const teamComments = new Map<string, string[]>();
  for (const c of theComments) if (!c.clientSide) (teamComments.get(c.creativeId) ?? teamComments.set(c.creativeId, []).get(c.creativeId)!).push(c.createdAt);
  const turnarounds: number[] = [];
  for (const c of theComments) {
    if (!c.clientSide) continue;
    const next = [...(teamComments.get(c.creativeId) ?? []), ...(versionTimes.get(c.creativeId) ?? [])]
      .filter((t) => t > c.createdAt)
      .sort()[0];
    if (next) turnarounds.push((new Date(next).getTime() - new Date(c.createdAt).getTime()) / 3_600_000);
  }

  return {
    posts: posts.length,
    approved: approved.length,
    promise: {
      sent: sends.length,
      medianDaysAhead: median(sends.map((x) => x.daysAhead)),
      metShare: pct(sends.filter((x) => x.daysAhead >= leadDaysOf(x.p.clientId)).length, sends.length),
      lateSends: sends
        .filter((x) => x.daysAhead < LATE_SEND_DAYS)
        .sort((a, b) => a.daysAhead - b.daysAhead)
        .map((x) => ({ id: x.p.id, name: x.p.name, clientId: x.p.clientId, sentAt: x.sentAt, scheduledAt: x.p.scheduledAt!, daysAhead: x.daysAhead })),
      medianDaysPlanned: median(planned.map((x) => x.ahead)),
      plannedMetShare: pct(planned.filter((x) => x.ahead >= leadDaysOf(x.p.clientId)).length, planned.length),
    },
    court: { onUs, onClient },
    accountability: {
      medianTurnaroundHours: median(turnarounds),
      lastMinuteApprovals: dated.filter((p) => {
        const before = days(p.approvedAt!, p.scheduledAt!);
        return before >= 0 && before < 2;
      }).length,
      approvedAfterLive: dated.filter((p) => p.approvedAt! > p.scheduledAt!).length,
      missedLive: posts.filter((p) => p.stage < 4 && p.scheduledAt && p.scheduledAt < nowIso).length,
      rework: posts.filter((p) => (eventsOf.get(p.id) ?? []).some((e) => e.fromStage === 4 && e.toStage < 4)).length,
      scopeChanges: theComments.filter((c) => c.category === "scope_change").length,
    },
    speed: {
      medianDaysToApproval: median(approved.map((p) => days(p.createdAt, p.approvedAt!))),
      medianDaysInStage: {
        concept: median(stageTimes[1] ?? []),
        internal: median(stageTimes[2] ?? []),
        client: median(stageTimes[3] ?? []),
      },
      approvedOnTime: pct(dated.filter((p) => p.approvedAt! <= p.scheduledAt!).length, dated.length),
      atRisk,
    },
    quality: {
      avgCreativeRounds: mean(approved.map((p) => rounds(p, "creative"))),
      avgCopyRounds: mean(approved.map((p) => rounds(p, "copy"))),
      firstTimeRight: pct(firstTime.length, approved.length),
      changesRequestedPosts: changed.length,
      changesRequestedShare: pct(changed.length, posts.length),
    },
    feedback: {
      comments: theComments.length,
      clientSide: theComments.filter((c) => c.clientSide).length,
      agencySide: theComments.filter((c) => !c.clientSide).length,
      byCategory: [...categories].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
      sentiment: {
        positive: theComments.filter((c) => c.sentiment === "positive").length,
        neutral: theComments.filter((c) => c.sentiment === "neutral").length,
        negative: theComments.filter((c) => c.sentiment === "negative").length,
        unscored: theComments.filter((c) => !c.sentiment).length,
      },
      unresolved: unresolved.length,
      oldestUnresolvedDays: unresolved.length ? Math.max(...unresolved.map((c) => days(c.createdAt, nowIso))) : null,
      medianDaysToResolve: median(threads.filter((c) => c.resolvedAt).map((c) => days(c.createdAt, c.resolvedAt!))),
      repeats: [...repeatKey.values()].filter((r) => r.count >= 2).sort((a, b) => b.count - a.count).slice(0, 8),
    },
  };
}

// One row per client or per person: the same numbers, split.
export interface GroupRow {
  id: string;
  posts: number;
  approved: number;
  medianDaysToApproval: number | null;
  medianDaysInClientReview: number | null;
  avgCreativeRounds: number | null;
  firstTimeRight: number | null;
  changesRequestedShare: number | null;
  clientComments: number;
  negativeShare: number | null; // of scored comments
  medianDaysAhead: number | null;
  metShare: number | null;
  lateSends: number;
  scopeChanges: number;
  rework: number;
  medianTurnaroundHours: number | null;
}

export function groupAnalytics(
  posts: APost[],
  key: (p: APost) => string | null,
  events: AEvent[],
  versions: AVersion[],
  comments: AComment[],
  now: Date = new Date(),
  leadDaysOf: (clientId: string) => number = () => 28,
): GroupRow[] {
  const groups = new Map<string, APost[]>();
  for (const p of posts) {
    const k = key(p);
    if (k) (groups.get(k) ?? groups.set(k, []).get(k)!).push(p);
  }
  return [...groups].map(([id, list]) => {
    const a = computeAnalytics(list, events, versions, comments, now, leadDaysOf);
    const scored = a.feedback.sentiment.positive + a.feedback.sentiment.neutral + a.feedback.sentiment.negative;
    return {
      id,
      posts: a.posts,
      approved: a.approved,
      medianDaysToApproval: a.speed.medianDaysToApproval,
      medianDaysInClientReview: a.speed.medianDaysInStage.client,
      avgCreativeRounds: a.quality.avgCreativeRounds,
      firstTimeRight: a.quality.firstTimeRight,
      changesRequestedShare: a.quality.changesRequestedShare,
      clientComments: a.feedback.clientSide,
      negativeShare: pct(a.feedback.sentiment.negative, scored),
      medianDaysAhead: a.promise.medianDaysAhead,
      metShare: a.promise.metShare,
      lateSends: a.promise.lateSends.length,
      scopeChanges: a.accountability.scopeChanges,
      rework: a.accountability.rework,
      medianTurnaroundHours: a.accountability.medianTurnaroundHours,
    };
  }).sort((a, b) => b.posts - a.posts);
}

// Week by week (decided directly: trends), the last `weeks` weeks to now,
// each starting on a Monday: approvals and their median time, how far ahead
// posts reached the client, and late sends.
export interface WeekRow {
  start: string; // the Monday, YYYY-MM-DD
  approvals: number;
  medianDaysToApproval: number | null;
  medianDaysAhead: number | null;
  lateSends: number;
}

export function weeklyTrends(posts: APost[], events: AEvent[], now: Date = new Date(), weeks = 12): WeekRow[] {
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const starts = Array.from({ length: weeks }, (_, i) => new Date(monday.getTime() - (weeks - 1 - i) * 7 * DAY_MS));
  const weekOf = (iso: string) => {
    const t = new Date(iso).getTime();
    for (let i = starts.length - 1; i >= 0; i--) if (t >= starts[i].getTime()) return t < starts[i].getTime() + 7 * DAY_MS ? i : -1;
    return -1;
  };
  const rows = starts.map(() => ({ approvals: [] as number[], ahead: [] as number[], late: 0 }));
  const byPost = new Map<string, AEvent[]>();
  for (const e of events) (byPost.get(e.creativeId) ?? byPost.set(e.creativeId, []).get(e.creativeId)!).push(e);
  for (const p of posts) {
    if (p.stage >= 4 && p.approvedAt) {
      const w = weekOf(p.approvedAt);
      if (w >= 0) rows[w].approvals.push(days(p.createdAt, p.approvedAt));
    }
    const sent = firstSentAt(byPost.get(p.id) ?? []);
    if (sent && p.scheduledAt) {
      const w = weekOf(sent);
      if (w >= 0) {
        const ahead = days(sent, p.scheduledAt);
        rows[w].ahead.push(ahead);
        if (ahead < LATE_SEND_DAYS) rows[w].late++;
      }
    }
  }
  return rows.map((r, i) => ({
    start: starts[i].toISOString().slice(0, 10),
    approvals: r.approvals.length,
    medianDaysToApproval: median(r.approvals),
    medianDaysAhead: median(r.ahead),
    lateSends: r.late,
  }));
}

// Delivered against the contract (phase73, decided directly): a post is
// delivered in the month it goes live, once approved. For each client with
// a contract, the last `months` calendar months to this one: delivered,
// and (all stages) planned to go live that month.
export interface MonthCell {
  month: string; // YYYY-MM
  delivered: number;
  planned: number;
}
export interface ContractRow {
  clientId: string;
  contract: number;
  months: MonthCell[];
}

export function contractDelivery(
  posts: APost[],
  contractOf: (clientId: string) => number | null,
  now: Date = new Date(),
  months = 6,
): ContractRow[] {
  const keys = Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
  const rows = new Map<string, ContractRow>();
  for (const p of posts) {
    const contract = contractOf(p.clientId);
    if (contract === null) continue;
    const row = rows.get(p.clientId) ?? { clientId: p.clientId, contract, months: keys.map((month) => ({ month, delivered: 0, planned: 0 })) };
    rows.set(p.clientId, row);
    if (!p.scheduledAt) continue;
    const cell = row.months.find((m) => m.month === p.scheduledAt!.slice(0, 7));
    if (!cell) continue;
    cell.planned++;
    if (p.stage >= 4 && p.approvedAt) cell.delivered++;
  }
  return [...rows.values()];
}
