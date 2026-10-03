// Run with: node --experimental-strip-types --test lib/billing/paddle.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyPaddleSignature } from "./paddle.ts";

const secret = "pdl_ntfset_test";
const body = '{"event_id":"evt_1"}';
const sign = (ts: number, b = body, s = secret) =>
  `ts=${ts};h1=${createHmac("sha256", s).update(`${ts}:${b}`).digest("hex")}`;

test("verifyPaddleSignature: accepts Paddle's signature, refuses anything else", () => {
  const now = 1_790_000_000_000;
  const ts = now / 1000;
  assert.equal(verifyPaddleSignature(body, sign(ts), secret, now), true);
  assert.equal(verifyPaddleSignature(body + " ", sign(ts), secret, now), false);
  assert.equal(verifyPaddleSignature(body, sign(ts, body, "other"), secret, now), false);
  assert.equal(verifyPaddleSignature(body, null, secret, now), false);
  assert.equal(verifyPaddleSignature(body, "ts=;h1=", secret, now), false);
  assert.equal(verifyPaddleSignature(body, `ts=${ts};h1=abc`, secret, now), false);
});

test("verifyPaddleSignature: refuses one older than five minutes", () => {
  const now = 1_790_000_000_000;
  assert.equal(verifyPaddleSignature(body, sign(now / 1000 - 301), secret, now), false);
  assert.equal(verifyPaddleSignature(body, sign(now / 1000 - 299), secret, now), true);
});
