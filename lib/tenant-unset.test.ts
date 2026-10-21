// Run with: node --experimental-strip-types --test lib/tenant-unset.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

// With NEXT_PUBLIC_FRONT_DOOR_HOST unset (staging, previews, and live until
// it's switched on), the front door stays the bare domain, as before.
delete process.env.NEXT_PUBLIC_FRONT_DOOR_HOST;
const { frontDoorFor } = await import("./tenant.ts");

test("unset, the front door is the bare domain", () => {
  assert.equal(frontDoorFor("nofluff.beingfrank.app"), "beingfrank.app");
  assert.equal(frontDoorFor("beingfrank.app"), "beingfrank.app");
});
