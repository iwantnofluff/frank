// Run with: node --experimental-strip-types --test lib/ai/build-check-prompt.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCheckPrompt, parseCheckFindings } from "./build-check-prompt.ts";

test("buildCheckPrompt — every section present, including the reference notes", () => {
  const prompt = buildCheckPrompt({
    intro: "You check ad copy for X.",
    concept: "Announce the new coach hiring",
    copyText: "Headline: Real coaching, finally.",
    referenceLabel: "Client knowledge",
    referenceNotes: ["No exclamation marks.", "Warm, simple language."],
    attachmentTitles: [],
    findingCount: 3,
  });
  assert.match(prompt, /You check ad copy for X\./);
  assert.match(prompt, /Concept: Announce the new coach hiring/);
  assert.match(prompt, /Headline: Real coaching, finally\./);
  assert.match(prompt, /Client knowledge:/);
  assert.match(prompt, /No exclamation marks\./);
  assert.match(prompt, /Warm, simple language\./);
  assert.match(prompt, /exactly 3 findings/);
  assert.match(prompt, /exactly 3 blocks/);
});

test("buildCheckPrompt — omits concept and reference notes when empty, rather than printing blank headers", () => {
  const prompt = buildCheckPrompt({
    intro: "You check ad copy for X.",
    concept: null,
    copyText: "Just some copy.",
    referenceLabel: "Agency reference material",
    referenceNotes: [],
    attachmentTitles: [],
    findingCount: 3,
  });
  assert.doesNotMatch(prompt, /Concept:/);
  assert.doesNotMatch(prompt, /Agency reference material:/);
  assert.match(prompt, /Just some copy\./);
});

test("buildCheckPrompt — names attached PDF documents even with zero text notes", () => {
  const prompt = buildCheckPrompt({
    intro: "You check ad copy for X.",
    concept: null,
    copyText: "Just some copy.",
    referenceLabel: "Agency reference material",
    referenceNotes: [],
    attachmentTitles: ["Cialdini's Six Principles of Persuasion.pdf"],
    findingCount: 3,
  });
  assert.match(prompt, /attached document\(s\): Cialdini's Six Principles of Persuasion\.pdf/);
});

test("parseCheckFindings — splits well-formed blocks, both tones", () => {
  const text = [
    "TONE: OK",
    "TITLE: Good hook",
    "BODY: Leads with a concrete reader benefit.",
    "---",
    "TONE: WARN",
    "TITLE: No urgency",
    "BODY: Nothing here creates a reason to act now.",
  ].join("\n");
  const findings = parseCheckFindings(text);
  assert.equal(findings.length, 2);
  assert.equal(findings[0].tone, "ok");
  assert.equal(findings[0].title, "Good hook");
  assert.equal(findings[0].body, "Leads with a concrete reader benefit.");
  assert.equal(findings[1].tone, "warn");
  assert.equal(findings[1].title, "No urgency");
});

test("parseCheckFindings — a block missing any field is dropped, not kept half-empty", () => {
  const text = ["TONE: OK", "TITLE: Missing a body"].join("\n");
  assert.deepEqual(parseCheckFindings(text), []);
});

test("parseCheckFindings — empty input yields no findings", () => {
  assert.deepEqual(parseCheckFindings(""), []);
  assert.deepEqual(parseCheckFindings("   \n  "), []);
});
