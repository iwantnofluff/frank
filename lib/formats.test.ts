// Run with: node --experimental-strip-types --test lib/formats.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { FORMATS, FORMAT_CATEGORIES, formatById, formatsByCategory, postFormats, formatsLabel, copyFieldsFor, copySummary } from "./formats.ts";

test("FORMATS has exactly 41 entries, matching the prototype's catalog", () => {
  assert.equal(FORMATS.length, 41);
});

test("every id is unique", () => {
  const ids = FORMATS.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("every format's category is one of FORMAT_CATEGORIES", () => {
  for (const f of FORMATS) {
    assert.ok(
      (FORMAT_CATEGORIES as readonly string[]).includes(f.category),
      `${f.id} has an unlisted category: ${f.category}`,
    );
  }
});

test("every category has at least one format, and formatsByCategory covers all of them", () => {
  let total = 0;
  for (const category of FORMAT_CATEGORIES) {
    const inCategory = formatsByCategory(category);
    assert.ok(inCategory.length > 0, `${category} has no formats`);
    total += inCategory.length;
  }
  assert.equal(total, FORMATS.length);
});

test("formatById finds a known format and returns undefined for an unknown one", () => {
  assert.equal(formatById("ig_feed")?.label, "Instagram Feed");
  assert.equal(formatById("not_a_real_format"), undefined);
});

test("several formats: labels joined, copy fields combined once each, older rows fall back", () => {
  assert.equal(formatsLabel(["meta_feed", "ig_feed"]), "Meta Feed Ad + Instagram Feed");
  assert.deepEqual(copyFieldsFor(["ig_feed", "meta_feed", "lp"]), [
    "caption", "alt", "primary", "headline", "description", "cta", "body",
  ]);
  assert.deepEqual(copyFieldsFor(["ig_story"]), []);
  assert.deepEqual(postFormats({ format: "ig_feed", formats: [] }), ["ig_feed"]);
  assert.deepEqual(postFormats({ format: "meta_feed", formats: ["meta_feed", "ig_feed"] }), ["meta_feed", "ig_feed"]);
});

test("copySummary: a caption alone reads plainly; other fields are labelled, in the formats' order", () => {
  assert.equal(copySummary({ caption: " Hello " }, ["ig_feed"]), "Hello");
  assert.equal(copySummary({ alt: "A bottle", caption: "Hello" }, ["ig_feed"]), "Caption: Hello\nAlt Text: A bottle");
  assert.equal(copySummary({ hook: "Wait", headline: "Not this format" }, ["ig_reel"]), "On-screen Hook: Wait");
  assert.equal(copySummary({}, ["ig_feed"]), "");
});
