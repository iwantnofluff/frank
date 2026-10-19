// Run with: node --experimental-strip-types --test lib/formats.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { FORMATS, FORMAT_CATEGORIES, formatById, formatsByCategory, postFormats, formatsLabel, copyFieldsFor, copySummary, copySummaryParts, VIDEO_FORMAT_IDS, hasVideoFormat, frameLimits, expectedContent } from "./formats.ts";

test("FORMATS has the prototype's 41 entries, plus Listing Image Set", () => {
  assert.equal(FORMATS.length, 42);
});

test("Listing Image Set: up to 9 square images, as a carousel's slides, with the listing's copy", () => {
  const set = formatById("amz_gallery")!;
  assert.equal(set.category, "Amazon");
  assert.equal(set.aspectRatio, "1:1");
  assert.deepEqual(frameLimits(["amz_gallery"]), { min: 2, max: 9, noun: "Slide" });
  assert.deepEqual(copyFieldsFor(["amz_gallery"]), ["title", "bullets", "description"]);
  assert.deepEqual(expectedContent(["amz_gallery"]), { slides: true, voiceover: false, copy: true, alt: false });
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
  assert.equal(formatById("ig_feed")?.label, "Instagram Post");
  assert.equal(formatById("not_a_real_format"), undefined);
});

test("several formats: labels joined, copy fields combined once each, older rows fall back", () => {
  assert.equal(formatsLabel(["meta_feed", "ig_feed"]), "Meta Feed Ad + Instagram Post");
  assert.deepEqual(copyFieldsFor(["ig_feed", "meta_feed", "lp"]), [
    "caption", "alt", "primary", "headline", "description", "cta", "body",
  ]);
  assert.deepEqual(copyFieldsFor(["ig_story"]), []);
  assert.deepEqual(postFormats({ format: "ig_feed", formats: [] }), ["ig_feed"]);
  assert.deepEqual(postFormats({ format: "meta_feed", formats: ["meta_feed", "ig_feed"] }), ["meta_feed", "ig_feed"]);
});

test("copySummary: every field plain, never labelled, a blank line apart, in the formats' order", () => {
  assert.equal(copySummary({ caption: " Hello " }, ["ig_feed"]), "Hello");
  // Not Alt Text (direct instruction).
  assert.equal(copySummary({ alt: "A bottle", caption: "Hello\n\nMore" }, ["ig_feed"]), "Hello\n\nMore");
  // No field names (direct instruction: no "Primary Text:").
  assert.equal(copySummary({ caption: "Hi", hook: "Wait for it" }, ["ig_reel"]), "Hi\n\nWait for it");
  assert.equal(copySummary({ hook: "Wait", headline: "Not this format" }, ["ig_reel"]), "Wait");
  assert.equal(copySummary({ primary: "Another test" }, ["li_sponsored"]), "Another test");
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

test("expectedContent: what a post's formats call for, so the table can say Pending", () => {
  assert.deepEqual(expectedContent(["ig_feed"]), { slides: false, voiceover: false, copy: true, alt: true });
  assert.deepEqual(expectedContent(["ig_carousel"]).slides, true);
  // A story counts as video, so it has a VO, as in the New Post window.
  assert.deepEqual(expectedContent(["ig_story"]), { slides: true, voiceover: true, copy: false, alt: false });
  assert.equal(expectedContent(["ig_reel"]).voiceover, true);
  assert.deepEqual(expectedContent(["amz_main"]), { slides: false, voiceover: false, copy: false, alt: false });
});
