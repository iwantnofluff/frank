// Run with: node --experimental-strip-types --test lib/shared-link-eligibility.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveShareEligibility, type EligibilityCreative } from "./shared-link-eligibility.ts";

const creatives: EligibilityCreative[] = [
  { id: "a", stage: 1 }, // concept
  { id: "b", stage: 3 }, // internal review
  { id: "c", stage: 4 }, // client review
  { id: "d", stage: 5 }, // approved
];

test("all — every creative shows; those not in Client Review are read only", () => {
  const r = resolveShareEligibility(creatives, "all");
  assert.equal(r.candidateCount, 4);
  assert.equal(r.readOnlyCount, 3); // a, b, d
});

test("pending — only Client Review, none read only", () => {
  const r = resolveShareEligibility(creatives, "pending");
  assert.equal(r.candidateCount, 1); // c
  assert.equal(r.readOnlyCount, 0);
});

test("pending — zero when nothing is in Client Review", () => {
  const noneInReview: EligibilityCreative[] = [{ id: "a", stage: 1 }, { id: "b", stage: 5 }];
  const r = resolveShareEligibility(noneInReview, "pending");
  assert.equal(r.candidateCount, 0);
  assert.equal(r.readOnlyCount, 0);
});

test("one — a post in Concept shows, read only", () => {
  const r = resolveShareEligibility(creatives, "one", { currentCreativeId: "a" });
  assert.equal(r.candidateCount, 1);
  assert.equal(r.readOnlyCount, 1);
});

test("one — a post in Client Review takes comments", () => {
  const r = resolveShareEligibility(creatives, "one", { currentCreativeId: "c" });
  assert.equal(r.candidateCount, 1);
  assert.equal(r.readOnlyCount, 0);
});

test("pick — mixed picks all show, some read only", () => {
  const r = resolveShareEligibility(creatives, "pick", { pickedIds: ["a", "c", "d"] });
  assert.equal(r.candidateCount, 3);
  assert.equal(r.readOnlyCount, 2); // a, d
});

test("pick — nothing picked yet, zero candidates", () => {
  const r = resolveShareEligibility(creatives, "pick", { pickedIds: [] });
  assert.equal(r.candidateCount, 0);
  assert.equal(r.readOnlyCount, 0);
});

test("every scope also shows the project's other Client Review posts (phase69)", () => {
  const more: EligibilityCreative[] = [...creatives, { id: "e", stage: 4 }];
  assert.equal(resolveShareEligibility(more, "one", { currentCreativeId: "d" }).alsoInClientReview, 2); // c, e
  assert.equal(resolveShareEligibility(more, "pick", { pickedIds: ["c"] }).alsoInClientReview, 1); // e
  assert.equal(resolveShareEligibility(more, "pending").alsoInClientReview, 0);
  assert.equal(resolveShareEligibility(more, "all").alsoInClientReview, 0);
});
