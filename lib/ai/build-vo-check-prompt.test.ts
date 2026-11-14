// Run with: node --experimental-strip-types --test lib/ai/build-vo-check-prompt.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVoCheckPrompt, voCheckResult } from "./build-vo-check-prompt.ts";

test("the prompt carries the VO and each slide's Text on Image, and asks for wording and meaning", () => {
  const p = buildVoCheckPrompt({ postName: "Diwali Teaser", vo: "Save 20% this Diwali.", texts: ["Save 20%", "  "], noun: "Slide" });
  assert.match(p, /"Diwali Teaser"/);
  assert.match(p, /VO:\nSave 20% this Diwali\./);
  assert.match(p, /Slide 1:\nSave 20%\n\nSlide 2:\n\(none\)/);
  assert.match(p, /Wording:/);
  assert.match(p, /Meaning:/);
  // A single piece: its words alone, not numbered.
  assert.match(buildVoCheckPrompt({ postName: "x", vo: "a", texts: ["Hello"], noun: "Image" }), /Text on Image:\nHello\n/);
});

test("a reply becomes a verdict and its mismatches, by kind", () => {
  const reply = [
    "TONE: WARN\nTITLE: Overall\nBODY: The screen promises 20% off; the VO says 30%.",
    "TONE: WARN\nTITLE: Wording: the discount\nBODY: VO: \"30% off\". Text on Image: \"20% off\". Use one figure.",
    "TONE: WARN\nTITLE: Meaning - who it's for\nBODY: The VO speaks to new customers; the screen to existing ones.",
  ].join("\n---\n");
  const r = voCheckResult(reply);
  assert.equal(r.same, false);
  assert.equal(r.summary, "The screen promises 20% off; the VO says 30%.");
  assert.deepEqual(
    r.mismatches.map((m) => [m.kind, m.title]),
    [
      ["wording", "the discount"],
      ["meaning", "who it's for"],
    ],
  );
});

test("an OK with no mismatches is the same message; nothing readable says so", () => {
  const same = voCheckResult("TONE: OK\nTITLE: Overall\nBODY: Both say the same thing.");
  assert.deepEqual(same, { same: true, summary: "Both say the same thing.", mismatches: [] });
  assert.equal(voCheckResult("I could not do that.").summary, "Frank couldn't read a result. Try the check again.");
  // An OK overall with a mismatch after it still differs.
  assert.equal(voCheckResult("TONE: OK\nTITLE: Overall\nBODY: Close.\n---\nTONE: WARN\nTITLE: Wording: name\nBODY: x").same, false);
});
