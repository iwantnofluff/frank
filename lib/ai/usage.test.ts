// Run with: node --experimental-strip-types --test lib/ai/usage.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { summariseUsage } from "./usage.ts";

const now = new Date("2026-11-05T10:00:00Z");
const row = (created_at: string, user_id = "a", task: string | null = "proofread") => ({ created_at, user_id, task });

test("counts this UTC month only, and resets on the 1st of next month", () => {
  const s = summariseUsage(
    [row("2026-10-31T23:59:59Z"), row("2026-11-01T00:00:00Z"), row("2026-11-05T09:00:00Z")],
    now,
  );
  assert.equal(s.used, 2);
  assert.equal(s.resetsOn.toISOString(), "2026-12-01T00:00:00.000Z");
});

test("one entry per day of the month, each with its requests, days after today marked", () => {
  const s = summariseUsage([row("2026-11-01T08:00:00Z"), row("2026-11-03T08:00:00Z"), row("2026-11-03T20:00:00Z")], now);
  assert.equal(s.byDay.length, 30);
  assert.deepEqual(
    s.byDay.slice(0, 6).map((d) => d.requests),
    [1, 0, 2, 0, 0, 0],
  );
  assert.equal(s.byDay[4].future, false);
  assert.equal(s.byDay[5].future, true);
  // February in a leap year.
  assert.equal(summariseUsage([], new Date("2028-02-10T00:00:00Z")).byDay.length, 29);
});

test("by feature and by person, most first; requests from before features were recorded kept as null", () => {
  const s = summariseUsage(
    [
      row("2026-11-02T08:00:00Z", "a", "copy_chat"),
      row("2026-11-02T09:00:00Z", "b", "proofread"),
      row("2026-11-02T10:00:00Z", "b", "proofread"),
      row("2026-11-02T11:00:00Z", "b", null),
    ],
    now,
  );
  assert.deepEqual(s.byTask, [
    { task: "proofread", requests: 2 },
    { task: "copy_chat", requests: 1 },
    { task: null, requests: 1 },
  ]);
  assert.deepEqual(s.byPerson, [
    { userId: "b", requests: 3 },
    { userId: "a", requests: 1 },
  ]);
});

test("no requests: zero used, every day still listed", () => {
  const s = summariseUsage([], now);
  assert.equal(s.used, 0);
  assert.equal(s.byDay.length, 30);
  assert.deepEqual(s.byTask, []);
});
