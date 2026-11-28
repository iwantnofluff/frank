// Run with: node --experimental-strip-types --test lib/month-review.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { inMonth, monthReviewPrompt, parseMonthReview } from "./month-review.ts";

test("parseMonthReview reads Frank's answer, fenced or not, and refuses anything else", () => {
  const answer = '```json\n{"verdict":"drifting","summary":"Leans on offers.","strategyCovered":["Diwali hamper: posts 1, 3"],"strategyMissing":[],"brandStrengths":[],"brandGaps":["Secondary TG unaddressed"],"mix":["Five carousels, no Reels"],"risks":[],"suggestions":["Add a Reel","", 3]}\n```';
  const r = parseMonthReview(answer)!;
  assert.equal(r.verdict, "drifting");
  assert.equal(r.summary, "Leans on offers.");
  assert.deepEqual(r.strategyCovered, ["Diwali hamper: posts 1, 3"]);
  assert.deepEqual(r.suggestions, ["Add a Reel"]);
  assert.deepEqual(r.risks, []);
  assert.equal(parseMonthReview("Sorry, I can't."), null);
  assert.equal(parseMonthReview('{"verdict":"great","summary":"x"}'), null);
  assert.equal(parseMonthReview('{"verdict":"on_track","summary":""}'), null);
});

test("inMonth matches a post's day to its month", () => {
  assert.equal(inMonth("2026-11-30", "2026-11-01"), true);
  assert.equal(inMonth("2026-12-01", "2026-11-01"), false);
  assert.equal(inMonth(null, "2026-11-01"), false);
});

test("the prompt carries the knowledge, the strategy, the contract and every post, numbered", () => {
  const p = monthReviewPrompt({
    clientName: "Casa",
    projectName: "Planner",
    monthLabel: "Nov 2026",
    knowledge: [{ section: "Tone of Voice", title: "Voice", body: "Warm and plain." }],
    strategy: "Objective: Sell the hamper",
    contractedPosts: 12,
    posts: [
      { date: "2026-11-03", name: "Hamper reveal", stage: "Client", formats: "Instagram Reel", concept: "Unboxing", copy: null, textOnImage: null, voiceover: null },
      { date: "2026-11-09", name: "Empty one", stage: "Concept", formats: "Instagram Post", concept: null, copy: null, textOnImage: null, voiceover: null },
    ],
  });
  assert.match(p, /\[Tone of Voice\] Voice: Warm and plain\./);
  assert.match(p, /Objective: Sell the hamper/);
  assert.match(p, /12 posts a month/);
  assert.match(p, /1\. 2026-11-03 · Hamper reveal · Instagram Reel · Client\nConcept: Unboxing/);
  assert.match(p, /2\. 2026-11-09 · Empty one · Instagram Post · Concept\nNothing written yet\./);
});
