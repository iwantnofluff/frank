// Run with: node --experimental-strip-types --test lib/ai/wiifm-prompt.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWiifmPrompt, parseWiifmNotes } from "./wiifm-prompt.ts";

test("the WIIFM prompt asks for what's working, as principles and biases, briefly", () => {
  const p = buildWiifmPrompt("A pixel duck", "Caption: Nobody misses on purpose.");
  assert.match(p, /psychology principles and cognitive biases/);
  assert.match(p, /3 to 5 bullets/);
  assert.match(p, /Only what's working\. Never say what's missing, weak or could be better/);
  assert.match(p, /The brief's concept: A pixel duck/);
  assert.doesNotMatch(buildWiifmPrompt(null, "x"), /concept/);
});

test("the reply reads back as up to five plain notes", () => {
  const text = "- **Curiosity gap:** \"Nobody misses on purpose\" makes you read on.\n\n2. Specificity: real numbers.\n• A\n* B\nC\nD";
  assert.deepEqual(parseWiifmNotes(text), [
    'Curiosity gap: "Nobody misses on purpose" makes you read on.',
    "Specificity: real numbers.",
    "A",
    "B",
    "C",
  ]);
});
