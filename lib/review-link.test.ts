import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewLinkPath, slugify } from "./review-link.ts";

test("names become lower-case words joined by hyphens", () => {
  assert.equal(slugify("HAPI Dental"), "hapi-dental");
  assert.equal(slugify("Eat the candy, protect the teeth!"), "eat-the-candy-protect-the-teeth");
  assert.equal(slugify("Café & Co."), "cafe-and-co");
  assert.equal(slugify("  --  "), "");
  assert.equal(slugify(null), "");
});

test("a long name is cut without a trailing hyphen", () => {
  const s = slugify("a ".repeat(40));
  assert.ok(s.length <= 60);
  assert.ok(!s.endsWith("-"));
});

test("the path is client, then post, then the code", () => {
  assert.equal(reviewLinkPath("k3J9", "HAPI Dental", "Sweet tooth"), "/review/hapi-dental/sweet-tooth/k3J9");
  // A name with nothing usable in it is left out, never an empty part.
  assert.equal(reviewLinkPath("k3J9", "HAPI Dental", "!!!"), "/review/hapi-dental/k3J9");
  assert.equal(reviewLinkPath("k3J9", null, null), "/review/k3J9");
});
