// Run with: node --experimental-strip-types --test lib/ai/build-caption-prompt.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCaptionPrompt, parseDraftOptions } from "./build-caption-prompt.ts";

const CAPTION_ONLY = [{ key: "caption", label: "Caption" }];
const META_FIELDS = [
  { key: "primary", label: "Primary Text" },
  { key: "headline", label: "Headline" },
  { key: "cta", label: "Call to Action" },
];

test("buildCaptionPrompt — every section present, including the format's own field list", () => {
  const prompt = buildCaptionPrompt({
    concept: "Announce the new coach hiring",
    approachNotes: ["Proof the pathway is real, not just promised"],
    formatLabel: "Meta Feed Ad",
    formatDirection: "125 chars, 1–2 sentences.",
    agencyNotes: ["Lead with the number if there is one."],
    clientNotes: ["No exclamation marks."],
    optionCount: 3,
    fields: META_FIELDS,
  });
  assert.match(prompt, /Announce the new coach hiring/);
  assert.match(prompt, /Proof the pathway is real/);
  assert.match(prompt, /Meta Feed Ad/);
  assert.match(prompt, /125 chars/);
  assert.match(prompt, /Lead with the number/);
  assert.match(prompt, /No exclamation marks/);
  assert.match(prompt, /exactly 3 blocks/);
  assert.match(prompt, /PRIMARY:/);
  assert.match(prompt, /HEADLINE:/);
  assert.match(prompt, /CTA:/);
  assert.match(prompt, /Primary Text, Headline, Call to Action/);
});

test("buildCaptionPrompt — omits empty sections rather than printing blank headers", () => {
  const prompt = buildCaptionPrompt({
    concept: null,
    approachNotes: [],
    formatLabel: "Instagram Feed",
    formatDirection: null,
    agencyNotes: [],
    clientNotes: [],
    optionCount: 3,
    fields: CAPTION_ONLY,
  });
  assert.doesNotMatch(prompt, /Concept:/);
  assert.doesNotMatch(prompt, /WIIFM\):/);
  assert.doesNotMatch(prompt, /Format direction:/);
  assert.doesNotMatch(prompt, /Agency reference material:/);
  assert.doesNotMatch(prompt, /Client knowledge:/);
  assert.match(prompt, /Instagram Feed/);
});

test("parseDraftOptions — splits well-formed blocks with a single field", () => {
  const text = [
    "PRINCIPLE: Scarcity",
    "CAPTION: Twelve spots left.",
    "---",
    "PRINCIPLE: Social proof",
    "CAPTION: Forty families already joined.",
  ].join("\n");
  const options = parseDraftOptions(text, CAPTION_ONLY);
  assert.equal(options.length, 2);
  assert.equal(options[0].principle, "Scarcity");
  assert.equal(options[0].fields.caption, "Twelve spots left.");
  assert.equal(options[1].principle, "Social proof");
  assert.equal(options[1].fields.caption, "Forty families already joined.");
});

test("parseDraftOptions — multiple fields per option, each parsed independently", () => {
  const text = [
    "PRINCIPLE: Authority",
    "PRIMARY: Trained by the pros.",
    "HEADLINE: Real coaching, finally.",
    "CTA: Book a trial.",
  ].join("\n");
  const [option] = parseDraftOptions(text, META_FIELDS);
  assert.equal(option.principle, "Authority");
  assert.equal(option.fields.primary, "Trained by the pros.");
  assert.equal(option.fields.headline, "Real coaching, finally.");
  assert.equal(option.fields.cta, "Book a trial.");
});

test("parseDraftOptions — a block with no matching fields is dropped, not kept empty", () => {
  const options = parseDraftOptions("Just some plain text with no labels at all.", CAPTION_ONLY);
  assert.deepEqual(options, []);
});

test("parseDraftOptions — empty input yields no options", () => {
  assert.deepEqual(parseDraftOptions("", CAPTION_ONLY), []);
  assert.deepEqual(parseDraftOptions("   \n  ", CAPTION_ONLY), []);
});
