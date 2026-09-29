// Run with: node --experimental-strip-types --test lib/ai/build-classify-comment-prompt.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClassifyCommentPrompt, parseClassification } from "./build-classify-comment-prompt.ts";

test("buildClassifyCommentPrompt — lists every category and the comment body", () => {
  const prompt = buildClassifyCommentPrompt({
    body: "This cream removes wrinkles in 3 days.",
    anchor: null,
    format: "ig_feed",
  });
  assert.match(prompt, /ig_feed/);
  assert.match(prompt, /This cream removes wrinkles in 3 days\./);
  assert.match(prompt, /claim_or_compliance:/);
  assert.match(prompt, /no_issue:/);
  assert.match(prompt, /CATEGORY:/);
  assert.match(prompt, /NOTE:/);
});

test("buildClassifyCommentPrompt — a highlight anchor quotes the exact wording", () => {
  const prompt = buildClassifyCommentPrompt({
    body: "This is too vague.",
    anchor: { type: "highlight", field: "caption", start: 0, end: 10, quote: "Buy it now" },
    format: "ig_feed",
  });
  assert.match(prompt, /highlights this exact wording[\s\S]*Buy it now/);
});

test("buildClassifyCommentPrompt — a pin/region anchor says it's on the artwork, not text", () => {
  const prompt = buildClassifyCommentPrompt({
    body: "Logo too close to the edge.",
    anchor: { type: "pin", x: 0.1, y: 0.2, n: 1 },
    format: "ig_story",
  });
  assert.match(prompt, /pinned directly on the artwork/);
});

test("buildClassifyCommentPrompt — no anchor context when there is none", () => {
  const prompt = buildClassifyCommentPrompt({ body: "Looks great!", anchor: null, format: "ig_feed" });
  assert.doesNotMatch(prompt, /artwork/);
  assert.doesNotMatch(prompt, /highlights/);
});

test("parseClassification — a well-formed reply", () => {
  const result = parseClassification("CATEGORY: claim_or_compliance\nNOTE: Claims wrinkles vanish in 3 days with no source.");
  assert.deepEqual(result, {
    category: "claim_or_compliance",
    note: "Claims wrinkles vanish in 3 days with no source.",
  });
});

test("parseClassification — case-insensitive category, trims whitespace", () => {
  const result = parseClassification("CATEGORY:  No_Issue  \nNOTE:  Just an acknowledgement.  ");
  assert.deepEqual(result, { category: "no_issue", note: "Just an acknowledgement." });
});

test("parseClassification — rejects an unknown category rather than guessing", () => {
  const result = parseClassification("CATEGORY: something_else\nNOTE: A note.");
  assert.equal(result, null);
});

test("parseClassification — missing NOTE returns null, not a half-parsed result", () => {
  const result = parseClassification("CATEGORY: timing");
  assert.equal(result, null);
});

test("parseClassification — missing CATEGORY returns null", () => {
  const result = parseClassification("NOTE: A note with no category.");
  assert.equal(result, null);
});
