// Run with: node --experimental-strip-types --test lib/post-filters.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_STATUSES, matchesFilter, platformOf, STATUS_OPTIONS, statusFilterLabel, statusKey } from "./post-filters.ts";

test("status filter: Idea, then the six stages, In Production second (phase102), Live last", () => {
  assert.deepEqual(STATUS_OPTIONS.map((f) => f.value), ["idea", "1", "2", "3", "4", "5", "6"]);
  assert.equal(STATUS_OPTIONS[0].label, "0. Idea");
  assert.equal(STATUS_OPTIONS[2].label, "2. In Production");
  assert.equal(STATUS_OPTIONS.at(-1)!.label, "6. Live");
  const dated = { stage: 3, format: "ig_feed", scheduled_at: "2026-10-20T09:00:00Z" };
  assert.equal(matchesFilter(dated, { statuses: ["3"], platform: "all" }), true);
  assert.equal(matchesFilter({ ...dated, stage: 2 }, { statuses: ["3"], platform: "all" }), false);
  // Any combination at once.
  assert.equal(matchesFilter({ ...dated, stage: 2 }, { statuses: ["2", "3"], platform: "all" }), true);
});

test("an Idea is a post with no date yet, whatever its stage underneath", () => {
  const idea = { stage: 3, format: "ig_feed", scheduled_at: null, due_on: null };
  assert.equal(statusKey(idea), "idea");
  assert.equal(statusKey({ ...idea, due_on: "2026-10-30" }), "3");
  assert.equal(matchesFilter(idea, { statuses: ["3"], platform: "all" }), false);
  assert.equal(matchesFilter(idea, { statuses: ["idea"], platform: "all" }), true);
  assert.equal(statusFilterLabel(ALL_STATUSES), "All Statuses");
  assert.equal(statusFilterLabel(["idea"]), "0. Idea");
  assert.equal(statusFilterLabel(["idea", "4"]), "2 Statuses");
});

test("platforms from formats; a post with several matches each", () => {
  assert.equal(platformOf("ig_story"), "meta");
  assert.equal(platformOf("fb_feed"), "meta");
  assert.equal(platformOf("wa_status"), "meta");
  assert.equal(platformOf("li_doc"), "linkedin");
  assert.equal(platformOf("pin"), "pinterest");
  assert.equal(platformOf("yt_short"), "youtube");
  assert.equal(platformOf("em_full"), null);
  const both = { stage: 1, format: "ig_feed", formats: ["ig_feed", "li_image"], scheduled_at: "2026-10-20T09:00:00Z" };
  assert.equal(matchesFilter(both, { statuses: ALL_STATUSES, platform: "meta" }), true);
  assert.equal(matchesFilter(both, { statuses: ALL_STATUSES, platform: "linkedin" }), true);
  assert.equal(matchesFilter(both, { statuses: ALL_STATUSES, platform: "youtube" }), false);
});

test("a post on a status that hides it is left out, unless Show Hidden takes the set away (phase143)", () => {
  const cancelled = { stage: 3, format: "ig_feed", scheduled_at: "2026-11-01T10:00:00Z", status_id: "cancel" };
  const held = { ...cancelled, status_id: "hold" };
  const none = { ...cancelled, status_id: null };
  const hidden = new Set(["cancel"]);
  assert.equal(matchesFilter(cancelled, { statuses: ALL_STATUSES, platform: "all", hidden }), false);
  assert.equal(matchesFilter(held, { statuses: ALL_STATUSES, platform: "all", hidden }), true);
  assert.equal(matchesFilter(none, { statuses: ALL_STATUSES, platform: "all", hidden }), true);
  assert.equal(matchesFilter(cancelled, { statuses: ALL_STATUSES, platform: "all" }), true);
});
