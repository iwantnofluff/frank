// Run with: node --experimental-strip-types --test lib/post-live.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { isLive, isOverdue, liveTiming } from "./post-live.ts";

const now = Date.parse("2026-10-13T09:00:00Z");

test("isLive — Approved and its Publish Date passed", () => {
  assert.equal(isLive({ stage: 4, scheduled_at: "2026-10-12T10:00:00Z" }, now), true);
  assert.equal(isLive({ stage: 4, scheduled_at: "2026-10-14T10:00:00Z" }, now), false);
});

test("isLive — never before Approved, whatever the date", () => {
  for (const stage of [1, 2, 3]) assert.equal(isLive({ stage, scheduled_at: "2026-10-01T10:00:00Z" }, now), false);
});

test("isLive — a continuous project's Live Date, from the start of that day; no date, not live", () => {
  assert.equal(isLive({ stage: 4, scheduled_at: null, due_on: "2026-10-12" }, now), true);
  assert.equal(isLive({ stage: 4, scheduled_at: null, due_on: "2026-10-20" }, now), false);
  assert.equal(isLive({ stage: 4, scheduled_at: null, due_on: null }, now), false);
});

test("isOverdue — past its date and not live", () => {
  assert.equal(isOverdue({ stage: 2, scheduled_at: "2026-10-12T10:00:00Z" }, now), true);
  assert.equal(isOverdue({ stage: 3, scheduled_at: "2026-10-14T10:00:00Z" }, now), false);
  // Approved and past: live, not late.
  assert.equal(isOverdue({ stage: 4, scheduled_at: "2026-10-12T10:00:00Z" }, now), false);
});

test("isOverdue — a Live Date is late only from the day after; no date, never", () => {
  assert.equal(isOverdue({ stage: 2, scheduled_at: null, due_on: "2026-10-12" }, now), true);
  assert.equal(isOverdue({ stage: 2, scheduled_at: null, due_on: "2026-10-13" }, now), false);
  assert.equal(isOverdue({ stage: 2, scheduled_at: null, due_on: null }, now), false);
});


test("liveTiming — on time that day or before, late from the next day", () => {
  const planned = { scheduled_at: "2026-10-14T09:00:00" };
  assert.equal(liveTiming(planned, "scheduled", "2026-10-14T21:00:00"), "on_time");
  assert.equal(liveTiming(planned, "scheduled", "2026-10-13T08:00:00"), "on_time");
  assert.equal(liveTiming(planned, "scheduled", "2026-10-15T00:30:00"), "late");
  // A continuous project's Live Date, a plain date.
  assert.equal(liveTiming({ scheduled_at: null, due_on: "2026-10-14" }, "continuous", "2026-10-14T23:00:00"), "on_time");
  assert.equal(liveTiming({ scheduled_at: null, due_on: "2026-10-14" }, "continuous", "2026-10-15T10:00:00"), "late");
  assert.equal(liveTiming({ scheduled_at: null }, "scheduled", "2026-10-15T10:00:00"), null);
});
