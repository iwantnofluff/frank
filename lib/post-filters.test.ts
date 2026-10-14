// Run with: node --experimental-strip-types --test lib/post-filters.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesFilter, platformOf, STATUS_FILTERS } from "./post-filters.ts";

test("status filter: the five stages, Live last (phase99)", () => {
  assert.deepEqual(STATUS_FILTERS.map((f) => f.value), ["all", "1", "2", "3", "4", "5"]);
  assert.equal(STATUS_FILTERS.at(-1)!.label, "5. Live");
  assert.equal(matchesFilter({ stage: 3, format: "ig_feed" }, { status: "3", platform: "all" }), true);
  assert.equal(matchesFilter({ stage: 2, format: "ig_feed" }, { status: "3", platform: "all" }), false);
});

test("platforms from formats; a post with several matches each", () => {
  assert.equal(platformOf("ig_story"), "meta");
  assert.equal(platformOf("fb_feed"), "meta");
  assert.equal(platformOf("wa_status"), "meta");
  assert.equal(platformOf("li_doc"), "linkedin");
  assert.equal(platformOf("pin"), "pinterest");
  assert.equal(platformOf("yt_short"), "youtube");
  assert.equal(platformOf("em_full"), null);
  const both = { stage: 1, format: "ig_feed", formats: ["ig_feed", "li_image"] };
  assert.equal(matchesFilter(both, { status: "all", platform: "meta" }), true);
  assert.equal(matchesFilter(both, { status: "all", platform: "linkedin" }), true);
  assert.equal(matchesFilter(both, { status: "all", platform: "youtube" }), false);
});
