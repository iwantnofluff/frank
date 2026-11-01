// Run with: node --experimental-strip-types --test lib/ai/build-design-check-prompt.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDesignCheckPrompt, designCheckFindings } from "./build-design-check-prompt.ts";

test("buildDesignCheckPrompt — names what's attached, in order, and compares with earlier posts", () => {
  const prompt = buildDesignCheckPrompt({ noun: "Slide", slides: 3, earlier: 10, hasLogo: true, brandNotes: ["[About] Headings in Inter"] });
  assert.match(prompt, /"Client logo"[^]*"Slide 1" to "Slide 3"[^]*"Earlier post 1" to "Earlier post 10"/);
  assert.match(prompt, /- \[About\] Headings in Inter/);
  assert.match(prompt, /same size, relative to the artwork, as on the earlier posts/);
  assert.match(prompt, /if the brand knowledge names the brand's fonts/);
  assert.match(prompt, /exactly 4 blocks/);
});

test("buildDesignCheckPrompt — with no earlier posts, no logo and no notes, judged on its own", () => {
  const prompt = buildDesignCheckPrompt({ noun: "Image", slides: 1, earlier: 0, hasLogo: false, brandNotes: [] });
  assert.doesNotMatch(prompt, /Client logo|Earlier post|brand knowledge/);
  assert.match(prompt, /an image titled "Image 1": the artwork being checked/);
  assert.match(prompt, /no earlier posts to compare with/);
});

test("designCheckFindings — the four areas in order, matched by title, a missing one said", () => {
  const reply = [
    "TONE: WARN\nTITLE: Fonts\nBODY: The headline is a serif; the earlier posts use a sans-serif.",
    "TONE: OK\nTITLE: Logo Size\nBODY: About the same size.",
    "TONE: OK\nTITLE: Visual Hierarchy\nBODY: Clear.",
  ].join("\n---\n");
  const found = designCheckFindings(reply);
  assert.deepEqual(
    found.map((f) => [f.title, f.tone]),
    [
      ["Logo Size", "ok"],
      ["Logo Position", "warn"],
      ["Fonts", "warn"],
      ["Visual Hierarchy", "ok"],
    ],
  );
  assert.match(found[1].body, /couldn't read a result/);
});

test("designCheckFindings — by order when no title names an area", () => {
  const reply = ["TONE: OK\nTITLE: A\nBODY: a", "TONE: WARN\nTITLE: B\nBODY: b"].join("\n---\n");
  const found = designCheckFindings(reply);
  assert.equal(found[0].title, "Logo Size");
  assert.equal(found[1].tone, "warn");
  assert.equal(found[1].title, "Logo Position");
});
