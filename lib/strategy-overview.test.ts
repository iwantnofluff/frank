import { test } from "node:test";
import assert from "node:assert/strict";

import { monthSection, monthSource, sectionSource, sourceHash } from "./strategy-overview.ts";

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
