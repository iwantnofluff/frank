// Run with: node --experimental-strip-types --test lib/monthly-strategy.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, filledFields, monthLabel, monthOf, strategyForPrompt } from "./monthly-strategy.ts";
import { buildCopyChatPrompt, type CopyChatContext } from "./ai/copy-chat.ts";

test("a month is its first day, from a date or a live date", () => {
  assert.equal(monthOf("2026-11-14T10:00:00Z"), "2026-11-01");
  assert.equal(monthOf("2026-11-01"), "2026-11-01");
  assert.equal(addMonths("2026-12-01", 1), "2027-01-01");
  assert.equal(addMonths("2026-01-01", -1), "2025-12-01");
  assert.equal(monthLabel("2026-10-01"), "October 2026");
});

test("only filled fields go to drafting, and an empty month gives nothing", () => {
  const row = { objective: "Launch the new range", key_messages: "  ", themes: null, offers: "20% off first order", key_dates: "", notes: null };
  assert.deepEqual(filledFields(row).map((f) => f.key), ["objective", "offers"]);
  const text = strategyForPrompt("2026-11-01", row)!;
  assert.match(text, /November 2026/);
  assert.match(text, /Objective: Launch the new range/);
  assert.match(text, /Offers and promotions: 20% off first order/);
  assert.doesNotMatch(text, /Key messages|Themes|Key dates|Notes/);
  assert.equal(strategyForPrompt("2026-11-01", { objective: " ", notes: null }), null);
  assert.equal(strategyForPrompt("2026-11-01", null), null);
});

test("Draft with Frank's prompt carries the month's strategy when there is one", () => {
  const context: CopyChatContext = {
    postName: "Gummy launch",
    concept: null,
    approachNotes: [],
    formatLabel: "Instagram Feed",
    formatDirection: null,
    agencyNotes: [],
    clientNotes: [],
    fileTitles: [],
    fields: [{ key: "caption", label: "Caption" }],
  };
  const withIt = buildCopyChatPrompt({ ...context, strategy: strategyForPrompt("2026-11-01", { objective: "Launch the new range" }) }, [], {});
  assert.match(withIt, /strategy for November 2026/);
  assert.match(withIt, /Objective: Launch the new range/);
  assert.doesNotMatch(buildCopyChatPrompt(context, [], {}), /strategy for/);
});
