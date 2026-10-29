// Run with: node --experimental-strip-types --test lib/ai/build-creative-check-prompt.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCreativeCheckPrompt, creativeCheckFindings } from "./build-creative-check-prompt.ts";

const slides = [
  { n: 1, text: "We spot the problem", hasImage: true },
  { n: 2, text: "", hasImage: true },
  { n: 3, text: "Book a call", hasImage: false },
];

test("buildCreativeCheckPrompt — only the slides with artwork, each with its words, and the block count", () => {
  const prompt = buildCreativeCheckPrompt(slides);
  assert.match(prompt, /Slide 1 Text on Image:\nWe spot the problem/);
  assert.match(prompt, /Slide 2 Text on Image:\n\(none: nothing was meant to be written on it\)/);
  assert.doesNotMatch(prompt, /Slide 3 Text on Image/);
  assert.match(prompt, /exactly 2 blocks/);
  assert.match(prompt, /TITLE: Slide <n>/);
});

test("buildCreativeCheckPrompt — another noun for a post's frames", () => {
  const prompt = buildCreativeCheckPrompt([{ n: 1, text: "Hi", hasImage: true }], "Image");
  assert.match(prompt, /Image 1 Text on Image:\nHi/);
  assert.match(prompt, /exactly 1 block,/);
});

test("creativeCheckFindings — matched by number, a slide with no artwork said without the model", () => {
  const reply = [
    "TONE: WARN\nTITLE: Slide 2\nBODY: The artwork says SALE but nothing was meant to be written.",
    "TONE: OK\nTITLE: Slide 1\nBODY: Matches.",
  ].join("\n---\n");
  const found = creativeCheckFindings(slides, reply);
  assert.deepEqual(
    found.map((f) => [f.title, f.tone]),
    [
      ["Slide 1", "ok"],
      ["Slide 2", "warn"],
      ["Slide 3", "warn"],
    ],
  );
  assert.match(found[2].body, /No artwork on this slide yet/);
});

test("creativeCheckFindings — by order when the titles carry no number, and a missing one says so", () => {
  const found = creativeCheckFindings(slides.slice(0, 2), "TONE: OK\nTITLE: First\nBODY: Matches.");
  assert.equal(found[0].tone, "ok");
  assert.equal(found[0].title, "Slide 1");
  assert.equal(found[1].tone, "warn");
  assert.match(found[1].body, /couldn't read a result/);
});
