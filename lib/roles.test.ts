// Run with: node --experimental-strip-types --test lib/roles.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { rolesICanInvite } from "./roles.ts";

test("rolesICanInvite: Owners any but Primary Owner; Admins with the switch below Owner; nobody else", () => {
  const staff = (role: "primary_owner" | "owner" | "admin" | "user", can_invite = false) => ({ role, client_id: null, can_invite });
  assert.deepEqual(rolesICanInvite(staff("primary_owner")), ["owner", "admin", "user", "client"]);
  assert.deepEqual(rolesICanInvite(staff("owner")), ["owner", "admin", "user", "client"]);
  assert.deepEqual(rolesICanInvite(staff("admin", true)), ["admin", "user", "client"]);
  assert.deepEqual(rolesICanInvite(staff("admin")), []);
  assert.deepEqual(rolesICanInvite(staff("user", true)), []);
  // A client-side person never invites, whatever their row says.
  assert.deepEqual(rolesICanInvite({ role: "owner", client_id: "c1", can_invite: true }), []);
  assert.deepEqual(rolesICanInvite(null), []);
});
