// Run with: node --experimental-strip-types --test lib/shared-link-eligibility.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveShareEligibility, type EligibilityCreative } from "./shared-link-eligibility.ts";

const creatives: EligibilityCreative[] = [
  { id: "a", stage: 1 }, // concept
  { id: "b", stage: 4 }, // internal QC
  { id: "c", stage: 5 }, // client review
  { id: "d", stage: 6 }, // approved
  { id: "e", stage: 8 }, // published
];

test("all — every creative below stage 5 is excluded, the rest eligible", () => {
  const r = resolveShareEligibility(creatives, "all");
  assert.equal(r.candidateCount, 5);
  assert.equal(r.eligibleCount, 3); // c, d, e
  assert.equal(r.excludedCount, 2); // a, b
});

test("all — zero eligible when every creative is still internal", () => {
  const internalOnly: EligibilityCreative[] = [{ id: "a", stage: 1 }, { id: "b", stage: 3 }];
  const r = resolveShareEligibility(internalOnly, "all");
  assert.equal(r.candidateCount, 2);
  assert.equal(r.eligibleCount, 0);
  assert.equal(r.excludedCount, 2);
});

test("pending — only stage 5 candidates, which are always already eligible (can't itself exclude)", () => {
  const r = resolveShareEligibility(creatives, "pending");
  assert.equal(r.candidateCount, 1); // c
  assert.equal(r.eligibleCount, 1);
  assert.equal(r.excludedCount, 0);
});

test("pending — comes back with zero candidates, not an exclusion, when nothing is at stage 5", () => {
  const noneInReview: EligibilityCreative[] = [{ id: "a", stage: 1 }, { id: "b", stage: 6 }];
  const r = resolveShareEligibility(noneInReview, "pending");
  assert.equal(r.candidateCount, 0);
  assert.equal(r.eligibleCount, 0);
  assert.equal(r.excludedCount, 0);
});

test("one — the single targeted creative, eligible", () => {
  const r = resolveShareEligibility(creatives, "one", { currentCreativeId: "d" });
  assert.equal(r.candidateCount, 1);
  assert.equal(r.eligibleCount, 1);
  assert.equal(r.excludedCount, 0);
});

test("one — the single targeted creative, excluded (still internal)", () => {
  const r = resolveShareEligibility(creatives, "one", { currentCreativeId: "a" });
  assert.equal(r.candidateCount, 1);
  assert.equal(r.eligibleCount, 0);
  assert.equal(r.excludedCount, 1);
});

test("pick — mixed picks, some eligible some not", () => {
  const r = resolveShareEligibility(creatives, "pick", { pickedIds: ["a", "c", "d"] });
  assert.equal(r.candidateCount, 3);
  assert.equal(r.eligibleCount, 2); // c, d
  assert.equal(r.excludedCount, 1); // a
});

test("pick — nothing picked yet, zero candidates", () => {
  const r = resolveShareEligibility(creatives, "pick", { pickedIds: [] });
  assert.equal(r.candidateCount, 0);
  assert.equal(r.eligibleCount, 0);
  assert.equal(r.excludedCount, 0);
});
