import { test } from "node:test";
import assert from "node:assert/strict";

import { GREETINGS, pickGreeting, addressed } from "./greetings.ts";

test("greetings follow a name: lower case start, no exclamation marks or ampersands", () => {
  for (const g of GREETINGS) {
    assert.equal(g[0], g[0].toLowerCase(), g);
    assert.ok(!/[!&]/.test(g), g);
  }
});

test("the same sign-in always gets the same greeting, and sign-ins vary", () => {
  assert.equal(pickGreeting("2026-10-01T09:00:00Z"), pickGreeting("2026-10-01T09:00:00Z"));
  const seen = new Set(Array.from({ length: 40 }, (_, i) => pickGreeting(`2026-10-01T09:${String(i).padStart(2, "0")}:00Z`)));
  assert.ok(seen.size > 5);
});

test("addressed leads with the first name, or capitalises without one", () => {
  assert.equal(addressed("Raj", "this post will be gone."), "Raj, this post will be gone.");
  assert.equal(addressed(null, "this post will be gone."), "This post will be gone.");
});
