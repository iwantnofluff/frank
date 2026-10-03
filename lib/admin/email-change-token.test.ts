// Run with: node --experimental-strip-types --test lib/admin/email-change-token.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeEmailChangeToken, readEmailChangeToken } from "./email-change-token.ts";

process.env.SUPABASE_SERVICE_ROLE_KEY ??= "unit-test-key";

test("email change link: reads back who and what, for an hour", () => {
  const now = 1_790_000_000_000;
  const token = makeEmailChangeToken("user-1", "new@example.com", now);
  assert.deepEqual(readEmailChangeToken(token, now + 59 * 60_000), { userId: "user-1", email: "new@example.com" });
  assert.equal(readEmailChangeToken(token, now + 61 * 60_000), null);
});

test("email change link: a changed address or signature is refused", () => {
  const now = 1_790_000_000_000;
  const [payload, mac] = makeEmailChangeToken("user-1", "new@example.com", now).split(".");
  const forged = Buffer.from(JSON.stringify({ u: "user-1", e: "attacker@example.com", x: now + 3_600_000 })).toString("base64url");
  assert.equal(readEmailChangeToken(`${forged}.${mac}`, now), null);
  assert.equal(readEmailChangeToken(`${payload}.${mac.slice(0, -2)}xx`, now), null);
  assert.equal(readEmailChangeToken("garbage", now), null);
  assert.equal(readEmailChangeToken("", now), null);
});
