// Run with: node --experimental-strip-types --test lib/analytics.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAnalytics, contractDelivery, filterPosts, groupAnalytics, median, stageDurations, weeklyTrends, type AComment, type AEvent, type APost, type AVersion } from "./analytics.ts";

const NOW = new Date("2026-10-20T12:00:00.000Z");
const d = (day: number, hour = 12) => new Date(Date.UTC(2026, 9, day, hour)).toISOString();

const post = (id: string, over: Partial<APost> = {}): APost => ({
  id,
  name: id,
  projectId: "p1",
  clientId: "c1",
  formats: ["ig_feed"],
  personId: "u1",
  stage: 4,
  createdAt: d(1),
  approvedAt: d(5),
  scheduledAt: d(10),
  ...over,
});

test("median: odd, even and none", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
});

test("stageDurations: time between moves; no time across a filled-in starting point", () => {
  const ev: AEvent[] = [
    { creativeId: "a", fromStage: null, toStage: 1, exception: null, at: d(1) },
    { creativeId: "a", fromStage: 1, toStage: 2, exception: null, at: d(3) },
    { creativeId: "a", fromStage: 2, toStage: 3, exception: null, at: d(4) },
    { creativeId: "a", fromStage: 3, toStage: 4, exception: null, at: d(6) },
  ];
  assert.deepEqual(stageDurations(ev), { 1: [2], 2: [1], 3: [2] });
  // An older post: created, then approved (both filled in by phase71).
  const filled: AEvent[] = [
    { creativeId: "b", fromStage: null, toStage: 1, exception: null, at: d(1) },
    { creativeId: "b", fromStage: null, toStage: 4, exception: null, at: d(9) },
  ];
  assert.deepEqual(stageDurations(filled), {});
});

test("stageDurations: a post's whole time in a stage, across Changes Requested and returns", () => {
  const ev: AEvent[] = [
    { creativeId: "a", fromStage: null, toStage: 1, exception: null, at: d(1) },
    { creativeId: "a", fromStage: 1, toStage: 3, exception: null, at: d(2) },
    { creativeId: "a", fromStage: 3, toStage: 3, exception: "changes_requested", at: d(4) },
    { creativeId: "a", fromStage: 3, toStage: 2, exception: null, at: d(5) },
    { creativeId: "a", fromStage: 2, toStage: 3, exception: null, at: d(6) },
    { creativeId: "a", fromStage: 3, toStage: 4, exception: null, at: d(8) },
  ];
  assert.deepEqual(stageDurations(ev), { 1: [1], 2: [1], 3: [5] });
});

test("filterPosts: client, project, person, format and date", () => {
  const posts = [post("a"), post("b", { clientId: "c2", formats: ["ig_reel"], personId: "u2", createdAt: d(15) })];
  assert.deepEqual(filterPosts(posts, { clientId: "c2" }).map((p) => p.id), ["b"]);
  assert.deepEqual(filterPosts(posts, { format: "ig_feed" }).map((p) => p.id), ["a"]);
  assert.deepEqual(filterPosts(posts, { personId: "u2" }).map((p) => p.id), ["b"]);
  assert.deepEqual(filterPosts(posts, { since: d(10) }).map((p) => p.id), ["b"]);
  assert.deepEqual(filterPosts(posts, {}).length, 2);
});

test("computeAnalytics: speed, quality and at-risk posts", () => {
  const posts = [
    post("a"), // 4 days to approval, on time, one version each
    post("b", { approvedAt: d(12), scheduledAt: d(10) }), // late, two rounds, changes asked
    post("c", { stage: 3, approvedAt: null, scheduledAt: d(22) }), // live in 2 days, not approved
    post("d", { stage: 2, approvedAt: null, scheduledAt: d(18) }), // overdue
  ];
  const events: AEvent[] = [{ creativeId: "b", fromStage: 3, toStage: 3, exception: "changes_requested", at: d(6) }];
  const versions: AVersion[] = [
    { creativeId: "a", kind: "creative", createdAt: d(2) },
    { creativeId: "a", kind: "copy", createdAt: d(2) },
    { creativeId: "b", kind: "creative", createdAt: d(2) },
    { creativeId: "b", kind: "creative", createdAt: d(2) },
    { creativeId: "b", kind: "copy", createdAt: d(2) },
  ];
  const a = computeAnalytics(posts, events, versions, [], NOW);
  assert.equal(a.posts, 4);
  assert.equal(a.approved, 2);
  assert.equal(a.speed.medianDaysToApproval, (4 + 11) / 2);
  assert.equal(a.speed.approvedOnTime, 0.5);
  assert.deepEqual(a.speed.atRisk.map((r) => [r.id, r.overdue]), [["d", true], ["c", false]]);
  assert.equal(a.quality.avgCreativeRounds, 1.5);
  assert.equal(a.quality.firstTimeRight, 0.5);
  assert.equal(a.quality.changesRequestedPosts, 1);
  assert.equal(a.quality.changesRequestedShare, 0.25);
});

test("computeAnalytics: feedback by side, issue, mood, resolution and repeats", () => {
  const posts = [post("a"), post("b")];
  const c = (over: Partial<AComment>): AComment => ({
    creativeId: "a", clientSide: true, category: null, sentiment: null, createdAt: d(2), resolvedAt: null, isReply: false, ...over,
  });
  const comments = [
    c({ category: "tone_and_brand", sentiment: "negative", resolvedAt: d(4) }),
    c({ creativeId: "b", category: "tone_and_brand", sentiment: "neutral" }),
    c({ clientSide: false, category: "no_issue", sentiment: "positive", createdAt: d(10) }),
    c({ isReply: true, clientSide: false }),
  ];
  const a = computeAnalytics(posts, [], [], comments, NOW);
  assert.equal(a.feedback.comments, 4);
  assert.equal(a.feedback.clientSide, 2);
  assert.equal(a.feedback.agencySide, 2);
  assert.deepEqual(a.feedback.byCategory[0], { category: "tone_and_brand", count: 2 });
  assert.deepEqual(a.feedback.sentiment, { positive: 1, neutral: 1, negative: 1, unscored: 1 });
  assert.equal(a.feedback.unresolved, 2); // threads only, not the reply
  assert.equal(a.feedback.oldestUnresolvedDays, 18);
  assert.equal(a.feedback.medianDaysToResolve, 2);
  assert.deepEqual(a.feedback.repeats, [{ clientId: "c1", format: "ig_feed", category: "tone_and_brand", count: 2 }]);
});

test("groupAnalytics: one row per client, busiest first", () => {
  const posts = [post("a"), post("b", { clientId: "c2" }), post("c", { clientId: "c2", stage: 3, approvedAt: null })];
  const rows = groupAnalytics(posts, (p) => p.clientId, [], [], [], NOW);
  assert.deepEqual(rows.map((r) => [r.id, r.posts, r.approved]), [["c2", 2, 1], ["c1", 1, 1]]);
});

const ev = (creativeId: string, fromStage: number | null, toStage: number, at: string, exception: string | null = null): AEvent => ({
  creativeId, fromStage, toStage, exception, at,
});

test("promise: days ahead of live when first sent to the client, against each client's promise; late sends", () => {
  const posts = [
    post("ok", { createdAt: d(1), scheduledAt: d(31) }), // sent day 2: 29 days ahead
    post("short", { clientId: "c2", createdAt: d(1), scheduledAt: d(20) }), // sent day 5: 15 ahead, c2 promises 14
    post("late", { createdAt: d(1), scheduledAt: d(9) }), // sent day 5: 4 ahead
    post("never", { stage: 2, approvedAt: null, createdAt: d(1), scheduledAt: d(40) }), // not sent yet
  ];
  const events = [ev("ok", 2, 3, d(2)), ev("short", 2, 3, d(5)), ev("late", 2, 3, d(5)), ev("late", 3, 3, d(6), "changes_requested")];
  const a = computeAnalytics(posts, events, [], [], NOW, (c) => (c === "c2" ? 14 : 28));
  assert.equal(a.promise.sent, 3);
  assert.equal(a.promise.medianDaysAhead, 15);
  assert.equal(Math.round(a.promise.metShare! * 100), 67); // ok and short met theirs; late didn't
  assert.deepEqual(a.promise.lateSends.map((x) => [x.id, x.daysAhead]), [["late", 4]]);
  // Planning: created to live, every post with a live date.
  assert.equal(a.promise.medianDaysPlanned, (19 + 30) / 2);
});

test("ball in court: the client has it in Client Review until changes are asked", () => {
  const posts = [
    post("withClient", { stage: 3, approvedAt: null }),
    post("changes", { stage: 3, approvedAt: null }),
    post("drafting", { stage: 1, approvedAt: null, createdAt: d(15) }),
    post("done"),
  ];
  const events = [ev("withClient", 2, 3, d(18)), ev("changes", 2, 3, d(10)), ev("changes", 3, 3, d(16), "changes_requested")];
  const a = computeAnalytics(posts, events, [], [], NOW);
  assert.deepEqual(a.court.onClient.map((x) => [x.id, Math.round(x.days)]), [["withClient", 2]]);
  assert.deepEqual(a.court.onUs.map((x) => [x.id, Math.round(x.days)]), [["drafting", 5], ["changes", 4]]);
});

test("accountability: turnaround, last-minute and late approvals, missed live dates, rework, scope changes", () => {
  const posts = [
    post("a", { approvedAt: d(9, 12), scheduledAt: d(10, 6) }), // approved 18 hours before live
    post("b", { approvedAt: d(12), scheduledAt: d(10) }), // after live
    post("c", { stage: 3, approvedAt: null, scheduledAt: d(15) }), // missed
  ];
  const comments: AComment[] = [
    { creativeId: "a", clientSide: true, category: "scope_change", sentiment: null, createdAt: d(3, 9), resolvedAt: null, isReply: false },
    { creativeId: "a", clientSide: false, category: null, sentiment: null, createdAt: d(3, 15), resolvedAt: null, isReply: true },
  ];
  const versions: AVersion[] = [{ creativeId: "a", kind: "creative", createdAt: d(4) }];
  const events = [ev("b", 4, 3, d(11)), ev("b", 3, 4, d(12))];
  const a = computeAnalytics(posts, events, versions, comments, NOW);
  assert.equal(a.accountability.medianTurnaroundHours, 6); // the team's reply 6 hours on
  assert.equal(a.accountability.lastMinuteApprovals, 1);
  assert.equal(a.accountability.approvedAfterLive, 1);
  assert.equal(a.accountability.missedLive, 1);
  assert.equal(a.accountability.rework, 1);
  assert.equal(a.accountability.scopeChanges, 1);
});

test("weeklyTrends: approvals and sends grouped by the Monday they fell in", () => {
  // NOW is Tuesday 20 Oct; this week starts Monday 19 Oct, last week 12 Oct.
  const posts = [
    post("a", { createdAt: d(10), approvedAt: d(13), scheduledAt: d(30) }),
    post("b", { createdAt: d(10), approvedAt: d(19, 9), scheduledAt: d(22) }),
  ];
  const events = [ev("a", 2, 3, d(12)), ev("b", 2, 3, d(19, 8))];
  const w = weeklyTrends(posts, events, NOW, 2);
  assert.deepEqual(w.map((r) => r.start), ["2026-10-12", "2026-10-19"]);
  assert.deepEqual(w.map((r) => r.approvals), [1, 1]);
  assert.equal(w[0].medianDaysAhead, 18);
  assert.deepEqual(w.map((r) => r.lateSends), [0, 1]);
});

test("contractDelivery: approved posts by live month against each client's contract; planned counts every stage", () => {
  const posts = [
    post("sep1", { scheduledAt: d(1).replace("-10-", "-09-") }), // Sept, approved
    post("oct1", { scheduledAt: d(25) }), // Oct, approved
    post("oct2", { stage: 3, approvedAt: null, scheduledAt: d(28) }), // Oct, not yet
    post("other", { clientId: "c9", scheduledAt: d(25) }), // no contract: left out
  ];
  const rows = contractDelivery(posts, (c) => (c === "c1" ? 12 : null), NOW, 2);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].contract, 12);
  assert.deepEqual(rows[0].months, [
    { month: "2026-09", delivered: 1, planned: 1 },
    { month: "2026-10", delivered: 1, planned: 2 },
  ]);
});
