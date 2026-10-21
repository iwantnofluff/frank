// Run with: node --experimental-strip-types --test lib/tenant.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

// As on live once the website takes beingfrank.app (decided directly, 21
// Oct 2026): set before the module reads it.
process.env.NEXT_PUBLIC_FRONT_DOOR_HOST = "app.beingfrank.app";
const { frontDoorFor, rootDomainOf, tenantFromHost } = await import("./tenant.ts");

test("app. is the front door, as the bare domain and www still are", () => {
  for (const host of ["app.beingfrank.app", "beingfrank.app", "www.beingfrank.app", "app.frank.localhost:3000", "frank.localhost:3000"]) {
    assert.deepEqual(tenantFromHost(host), { kind: "root" }, host);
  }
  assert.deepEqual(tenantFromHost("nofluff.beingfrank.app"), { kind: "agency", subdomain: "nofluff" });
  assert.deepEqual(tenantFromHost("admin.beingfrank.app"), { kind: "admin" });
  assert.deepEqual(tenantFromHost("frank-gamma-one.vercel.app"), { kind: "legacy" });
});

test("an address's root domain, with its port", () => {
  assert.equal(rootDomainOf("nofluff.beingfrank.app"), "beingfrank.app");
  assert.equal(rootDomainOf("app.beingfrank.app"), "beingfrank.app");
  assert.equal(rootDomainOf("nofluff.frank.localhost:3000"), "frank.localhost:3000");
  assert.equal(rootDomainOf("localhost:3000"), null);
});

test("the front door: the configured one on live, the bare domain locally", () => {
  assert.equal(frontDoorFor("nofluff.beingfrank.app"), "app.beingfrank.app");
  assert.equal(frontDoorFor("beingfrank.app"), "app.beingfrank.app");
  assert.equal(frontDoorFor("nofluff.frank.localhost:3000"), "frank.localhost:3000");
  assert.equal(frontDoorFor("localhost:3000"), null);
});
