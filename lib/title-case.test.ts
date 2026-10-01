// Run with: node --experimental-strip-types --test lib/title-case.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { titleCase } from "./title-case.ts";

test("lowercase words are capitalised", () => {
  assert.equal(titleCase("raj rana"), "Raj Rana");
  assert.equal(titleCase("senior designer"), "Senior Designer");
});

test("capitalises after apostrophes and hyphens, matching the database's title_case()", () => {
  assert.equal(titleCase("o'neil"), "O'Neil");
  assert.equal(titleCase("smith-jones"), "Smith-Jones");
});

test("accented letters are capitalised too", () => {
  assert.equal(titleCase("émile zola"), "Émile Zola");
});

test("words that already have capitals keep them", () => {
  assert.equal(titleCase("McDonald"), "McDonald");
  assert.equal(titleCase("UX designer"), "UX Designer");
  assert.equal(titleCase("CEO"), "CEO");
  assert.equal(titleCase("iOS developer"), "IOS Developer");
});

test("small joining words stay lowercase after the first word", () => {
  assert.equal(titleCase("head of design"), "Head of Design");
  assert.equal(titleCase("of mice"), "Of Mice");
});

test("collapses stray whitespace", () => {
  assert.equal(titleCase("  raj   rana "), "Raj Rana");
  assert.equal(titleCase("   "), "");
});
