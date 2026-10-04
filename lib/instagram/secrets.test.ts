// Run with: node --experimental-strip-types --test lib/instagram/secrets.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { decryptToken, encryptToken, signState, verifyState } from "./secrets.ts";

const KEY = randomBytes(32).toString("base64");
const OTHER = randomBytes(32).toString("base64");

test("a token is unreadable stored, and comes back with the key", () => {
  const stored = encryptToken("IGAA-secret-token", KEY);
  assert.ok(!stored.includes("IGAA"));
  assert.notEqual(stored, encryptToken("IGAA-secret-token", KEY), "a fresh iv each time");
  assert.equal(decryptToken(stored, KEY), "IGAA-secret-token");
  assert.throws(() => decryptToken(stored, OTHER));
});

test("state round-trips, and refuses tampering, another key, or age", () => {
  const state = { clientId: "c1", userId: "u1", returnOrigin: "https://nofluff.beingfrank.app", returnPath: "/settings", expiresAt: 2_000 };
  const signed = signState(state, KEY);
  assert.deepEqual(verifyState(signed, KEY, 1_000), state);
  assert.equal(verifyState(signed, OTHER, 1_000), null);
  assert.equal(verifyState(signed, KEY, 3_000), null);
  const [payload, sig] = signed.split(".");
  const forged = Buffer.from(JSON.stringify({ ...state, clientId: "c2" })).toString("base64url");
  assert.equal(verifyState(`${forged}.${sig}`, KEY, 1_000), null);
  assert.equal(verifyState(`${payload}.`, KEY, 1_000), null);
  assert.equal(verifyState(null, KEY), null);
});

test("Meta's signed request is read only with the app secret", async () => {
  const { parseSignedRequest } = await import("./secrets.ts");
  const { createHmac } = await import("node:crypto");
  const payload = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "1784" })).toString("base64url");
  const sig = createHmac("sha256", "app-secret").update(payload).digest("base64url");
  assert.deepEqual(parseSignedRequest(`${sig}.${payload}`, "app-secret"), { algorithm: "HMAC-SHA256", user_id: "1784" });
  assert.equal(parseSignedRequest(`${sig}.${payload}`, "another-secret"), null);
  assert.equal(parseSignedRequest(`${sig}x.${payload}`, "app-secret"), null);
  assert.equal(parseSignedRequest(null, "app-secret"), null);
});
