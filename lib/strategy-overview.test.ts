import { test } from "node:test";
import assert from "node:assert/strict";

import { isListSection, monthBoxLabel, monthSection, monthSource, overviewHash, overviewItems, overviewParagraphs, sectionSource, sourceHash } from "./strategy-overview.ts";

test("a section's source has notes in full and links and files by name, skipping the unnamed", () => {
  const source = sectionSource([
    { kind: "text", title: "Voice", body: "  Warm and plain. " },
    { kind: "text", title: "", body: "No jargon." },
    { kind: "link", title: "Brand book", body: null },
    { kind: "file", title: "", body: null },
  ]);
  assert.equal(source, 'Voice: Warm and plain.\n\nNo jargon.\n\nA link named "Brand book"');
});

test("a month's source is its filled fields only, in order", () => {
  assert.equal(monthSource({ notes: "Keep it light", objective: "Sell hampers", themes: "  " }), "Objective: Sell hampers\n\nNotes: Keep it light");
  assert.equal(monthSource(null), "");
  assert.equal(monthSection("2026-10-01"), "month:2026-10-01");
});

test("the fingerprint is steady for the same words and changes with any of them", () => {
  assert.equal(sourceHash("Warm and plain."), sourceHash("Warm and plain."));
  assert.notEqual(sourceHash("Warm and plain."), sourceHash("Warm and plain!"));
  assert.match(sourceHash(""), /^[0-9a-f]{8}$/);
});

test("an overview's fingerprint includes how it's written, so a new style rewrites it once", () => {
  assert.notEqual(overviewHash("Warm and plain."), sourceHash("Warm and plain."));
  assert.equal(overviewHash("Warm and plain."), overviewHash("Warm and plain."));
});

test("an overview splits into its paragraphs, however they're spaced", () => {
  assert.deepEqual(overviewParagraphs("One.\n\n  Two.\n \n\nThree.\n"), ["One.", "Two.", "Three."]);
  assert.deepEqual(overviewParagraphs("Just one."), ["Just one."]);
});

test("the month's box is named short, with fixed month names", () => {
  assert.equal(monthBoxLabel("2026-10-01"), "Oct 2026 Strategy");
  assert.equal(monthBoxLabel("2026-09-01"), "Sep 2026 Strategy");
});

test("Prioritised Features is a numbered list: its items read without numbers; paragraphs aren't a list", () => {
  assert.deepEqual(overviewItems("1. Daily Glow Serum\n2. A three-step routine\n\n3) Barrier Cream"), ["Daily Glow Serum", "A three-step routine", "Barrier Cream"]);
  assert.equal(overviewItems("Lead with the serum.\n\nThen the routine."), null);
  assert.equal(isListSection("features"), true);
  assert.equal(isListSection("tone"), false);
  // Its own fingerprint, so a features box written as paragraphs is rewritten once.
  assert.notEqual(overviewHash("x", "features"), overviewHash("x", "tone"));
  assert.equal(overviewHash("x", "tone"), overviewHash("x"));
});
