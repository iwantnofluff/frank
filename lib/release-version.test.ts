// Run with: node --experimental-strip-types --test lib/release-version.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareVersions, displayVersion } from "./release-version.ts";

test("versions compare by number, not as text", () => {
  assert.ok(compareVersions("1.12.0", "1.9.0") < 0);
  assert.ok(compareVersions("1.9.0", "1.12.0") > 0);
  assert.ok(compareVersions("1.12.1", "1.12.0") < 0);
  assert.equal(compareVersions("1.12.0", "1.12.0"), 0);
  assert.deepEqual(["1.2.0", "1.12.0", "1.10.3"].sort(compareVersions), ["1.12.0", "1.10.3", "1.2.0"]);
});

test("a version reads in order as a decimal, without a trailing .0", () => {
  assert.equal(displayVersion("1.12.0"), "1.12");
  assert.equal(displayVersion("1.5.0"), "1.05");
  assert.equal(displayVersion("1.8.1"), "1.08.1");
  assert.equal(displayVersion("1.0.0"), "1.00");
});
