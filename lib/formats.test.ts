// Run with: node --experimental-strip-types --test lib/formats.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { FORMATS, FORMAT_CATEGORIES, formatById, formatsByCategory, postFormats, formatsLabel, copyFieldsFor, copySummary, copySummaryParts, VIDEO_FORMAT_IDS, hasVideoFormat, frameLimits } from "./formats.ts";

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

test("copySummary: the caption plain, never labelled; other fields labelled after a blank line, in the formats' order", () => {
  assert.equal(copySummary({ caption: " Hello " }, ["ig_feed"]), "Hello");
  // Not Alt Text (direct instruction).
  assert.equal(copySummary({ alt: "A bottle", caption: "Hello\n\nMore" }, ["ig_feed"]), "Hello\n\nMore");
  assert.equal(copySummary({ caption: "Hi", hook: "Wait for it" }, ["ig_reel"]), "Hi\n\nOn-screen Hook: Wait for it");
  assert.equal(copySummary({ hook: "Wait", headline: "Not this format" }, ["ig_reel"]), "On-screen Hook: Wait");
  assert.equal(copySummary({}, ["ig_feed"]), "");
  assert.deepEqual(copySummaryParts({ hook: "Wait", caption: "Hello" }, ["ig_reel"]), {
    caption: "Hello",
    others: [{ label: "On-screen Hook", text: "Wait" }],
  });
});

test("a post has a VO when any of its formats is video (phase88)", () => {
  for (const id of VIDEO_FORMAT_IDS) assert.ok(formatById(id), `${id} is a real format`);
  assert.equal(hasVideoFormat(["ig_reel"]), true);
  assert.equal(hasVideoFormat(["ig_feed", "yt_short"]), true);
  assert.equal(hasVideoFormat(["ig_feed", "ig_carousel"]), false);
  assert.equal(hasVideoFormat([]), false);
});

test("frameLimits: a carousel's slides, a story's stories, or a single piece", () => {
  assert.deepEqual(frameLimits(["ig_carousel"]), { min: 2, max: 20, noun: "Slide" });
  assert.deepEqual(frameLimits(["meta_carousel", "ig_carousel"]), { min: 2, max: 10, noun: "Slide" });
  for (const id of ["ig_story", "fb_story", "wa_status"]) assert.deepEqual(frameLimits([id]), { min: 1, max: 20, noun: "Story" });
  // A carousel among them wins.
  assert.deepEqual(frameLimits(["ig_story", "ig_carousel"]), { min: 2, max: 20, noun: "Slide" });
  // A story among single pieces still makes it a set.
  assert.deepEqual(frameLimits(["ig_feed", "ig_story"]), { min: 1, max: 20, noun: "Story" });
  assert.equal(frameLimits(["ig_feed"]), null);
  // The Stories ad has its own copy and stays a single piece.
  assert.equal(frameLimits(["meta_story"]), null);
});
