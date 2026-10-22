// Run with: node --experimental-strip-types --test lib/tips.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { TIPS, nextTip, tipDue } from "./tips.ts";
import { helpArticle } from "./help-content.ts";

test("tipDue: off never, first ever always", () => {
  const now = new Date(2026, 9, 22, 15, 0);
  assert.equal(tipDue(0, null, now), false);
  assert.equal(tipDue(24, null, now), true);
  assert.equal(tipDue(2, null, now), true);
});

test("tipDue: once a day is a new day, not 24 hours", () => {
  const now = new Date(2026, 9, 22, 9, 0);
  assert.equal(tipDue(24, new Date(2026, 9, 22, 8, 0).toISOString(), now), false);
  assert.equal(tipDue(24, new Date(2026, 9, 21, 23, 0).toISOString(), now), true);
});

test("tipDue: every few hours once they've passed", () => {
  const now = new Date(2026, 9, 22, 15, 0);
  assert.equal(tipDue(2, new Date(2026, 9, 22, 13, 30).toISOString(), now), false);
  assert.equal(tipDue(2, new Date(2026, 9, 22, 13, 0).toISOString(), now), true);
  assert.equal(tipDue(1, new Date(2026, 9, 22, 13, 59).toISOString(), now), true);
});

test("nextTip: the first not yet seen, then none", () => {
  assert.equal(nextTip([])?.id, TIPS[0].id);
  assert.equal(nextTip([TIPS[0].id])?.id, TIPS[1].id);
  assert.equal(nextTip(TIPS.map((t) => t.id)), null);
});

test("every tip's Read More is a real Help article, and ids are unique", () => {
  for (const t of TIPS) assert.ok(helpArticle(t.articleId), `${t.id} → ${t.articleId}`);
  assert.equal(new Set(TIPS.map((t) => t.id)).size, TIPS.length);
});
