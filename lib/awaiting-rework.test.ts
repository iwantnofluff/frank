import { test } from "node:test";
import assert from "node:assert/strict";
import { awaitingRework, latestByCreative } from "./awaiting-rework.ts";

test("feedback newer than the latest version is still to be worked on", () => {
  assert.equal(awaitingRework("2026-11-23T10:00:00Z", "2026-11-23T09:00:00Z"), true);
  assert.equal(awaitingRework("2026-11-23T09:00:00Z", "2026-11-23T10:00:00Z"), false);
  assert.equal(awaitingRework("2026-11-23T09:00:00Z", null), true);
  assert.equal(awaitingRework(null, "2026-11-23T09:00:00Z"), false);
});

test("the same moment written two ways compares as equal, not newer", () => {
  assert.equal(awaitingRework("2026-11-23T09:00:00.5+00:00", "2026-11-23T09:00:00.500Z"), false);
});

test("each post's latest version wins, whatever the order", () => {
  const latest = latestByCreative([
    { creative_id: "a", created_at: "2026-11-20T09:00:00Z" },
    { creative_id: "a", created_at: "2026-11-22T09:00:00+00:00" },
    { creative_id: "a", created_at: "2026-11-21T09:00:00Z" },
    { creative_id: "b", created_at: "2026-11-19T09:00:00Z" },
  ]);
  assert.equal(latest.get("a"), "2026-11-22T09:00:00+00:00");
  assert.equal(latest.get("b"), "2026-11-19T09:00:00Z");
});
