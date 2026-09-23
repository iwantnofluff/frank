// Run with: node --experimental-strip-types --test lib/errors.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { errorMessage } from "./errors.ts";

test("errorMessage — a real Error instance", () => {
  assert.equal(errorMessage(new Error("boom"), "fallback"), "boom");
});

test("errorMessage — a Supabase-shaped plain object (not instanceof Error)", () => {
  // Exactly the shape verified empirically against this project's own
  // Supabase instance — see the comment in lib/errors.ts.
  const supabaseError = {
    code: "42501",
    details: null,
    hint: null,
    message: 'new row violates row-level security policy for table "clients"',
  };
  assert.equal(errorMessage(supabaseError, "fallback"), supabaseError.message);
});

test("errorMessage — null/undefined/non-object falls back", () => {
  assert.equal(errorMessage(null, "fallback"), "fallback");
  assert.equal(errorMessage(undefined, "fallback"), "fallback");
  assert.equal(errorMessage("a string", "fallback"), "fallback");
});

test("errorMessage — object without a string message falls back", () => {
  assert.equal(errorMessage({ code: "X" }, "fallback"), "fallback");
  assert.equal(errorMessage({ message: 42 }, "fallback"), "fallback");
});
