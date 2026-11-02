// Run with: node --experimental-strip-types --test lib/ai/cost.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { AI_MODELS } from "./models.ts";
import { PRICES_PER_MILLION, requestCost, totalCost } from "./cost.ts";

test("every model Frank answers has a price", () => {
  for (const m of AI_MODELS) assert.ok(PRICES_PER_MILLION[m.id], m.id);
});

test("requestCost: input, cache reads and output at their own prices", () => {
  // 1M in on Opus 5.5 is $4, 1M read from cache $0.20, 1M out $20.
  const c = requestCost({ model: "claude-opus-5-5", input_tokens: 1_000_000, cache_read_tokens: 1_000_000, output_tokens: 1_000_000 });
  assert.equal(c, 24.2);
  assert.equal(
    requestCost({ model: "claude-sonnet-5-5", input_tokens: 453, cache_read_tokens: 0, output_tokens: 837 }),
    (453 * 2 + 837 * 10) / 1_000_000,
  );
});

test("requestCost: null without tokens or for an unknown model", () => {
  assert.equal(requestCost({ model: "claude-opus-5-5", input_tokens: null, cache_read_tokens: null, output_tokens: null }), null);
  assert.equal(requestCost({ model: "no-such-model", input_tokens: 10, cache_read_tokens: 0, output_tokens: 10 }), null);
});

test("totalCost: sums what it can and counts the rest", () => {
  const t = totalCost([
    { model: "claude-haiku-5-5", input_tokens: 1_000_000, cache_read_tokens: null, output_tokens: 0 },
    { model: "claude-opus-5-5", input_tokens: null, cache_read_tokens: null, output_tokens: null },
  ]);
  assert.equal(t.dollars, 0.1);
  assert.equal(t.unpriced, 1);
});
