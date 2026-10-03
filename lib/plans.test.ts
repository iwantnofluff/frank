// Run with: node --experimental-strip-types --test lib/plans.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { brandingAllowed, customAddressAllowed, formatBytes, isReadOnly, PLANS, storageProblem } from "./plans.ts";

test("isReadOnly: only Free, and only once its trial is over", () => {
  const now = Date.parse("2026-10-03T12:00:00Z");
  assert.equal(isReadOnly("free", "2026-10-04T00:00:00Z", now), false);
  assert.equal(isReadOnly("free", "2026-10-03T11:59:59Z", now), true);
  // No trial on record (an agency that was never given one, or a cancelled
  // paid plan that dropped to Free): read-only.
  assert.equal(isReadOnly("free", null, now), true);
  for (const paid of ["starter", "growth", "agency", "enterprise"]) assert.equal(isReadOnly(paid, null, now), false);
});

test("white-label by tier: logo and colours from Growth, own address from Agency", () => {
  assert.deepEqual(
    PLANS.map((p) => [p.id, brandingAllowed(p.id), customAddressAllowed(p.id)]),
    [
      ["free", false, false],
      ["starter", false, false],
      ["growth", true, false],
      ["agency", true, true],
      ["enterprise", true, true],
    ],
  );
  assert.equal(brandingAllowed(undefined), false);
});

// The same table as plan_limits() in the database (phase42).
test("each plan's clients, members and storage, as the spec has them", () => {
  assert.deepEqual(
    PLANS.map((p) => ({ client_limit: p.clients, seat_limit: p.seats, storage_limit_bytes: p.storageBytes })),
    [
      { client_limit: 1, seat_limit: 2, storage_limit_bytes: 500 * 1024 ** 2 },
      { client_limit: 3, seat_limit: 5, storage_limit_bytes: 5 * 1024 ** 3 },
      { client_limit: 10, seat_limit: 15, storage_limit_bytes: 25 * 1024 ** 3 },
      { client_limit: 25, seat_limit: null, storage_limit_bytes: 75 * 1024 ** 3 },
      { client_limit: null, seat_limit: null, storage_limit_bytes: null },
    ],
  );
});

test("formatBytes", () => {
  assert.equal(formatBytes(0), "0 KB");
  assert.equal(formatBytes(2048), "2 KB");
  assert.equal(formatBytes(115022010), "110 MB");
  assert.equal(formatBytes(5 * 1024 ** 3), "5 GB");
  assert.equal(formatBytes(1.25 * 1024 ** 3), "1.3 GB");
  assert.equal(formatBytes(null), "Unlimited");
});

test("storageProblem: fits, or says how much room is left", () => {
  const mb = 1024 ** 2;
  assert.equal(storageProblem(400 * mb, 500 * mb, 100 * mb), null);
  assert.equal(storageProblem(0, null, 10 * 1024 ** 3), null);
  assert.equal(
    storageProblem(450 * mb, 500 * mb, 60 * mb),
    "This file needs 60 MB, and your plan's 500 MB of storage has 50 MB left. Delete files you no longer need, or move to a bigger plan.",
  );
  // Already over (a downgrade the admin forced, say): nothing left.
  assert.match(storageProblem(600 * mb, 500 * mb, 1)!, /has 0 KB left/);
});
