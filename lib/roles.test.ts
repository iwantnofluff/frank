// Run with: node --experimental-strip-types --test lib/roles.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { canManageMember, rolesBelow, rolesICanInvite, type AgencyRole } from "./roles.ts";

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

test("everyone manages only the people below them (phase49)", () => {
  const as = (role: AgencyRole, client_id: string | null = null) => ({ role, client_id });
  assert.equal(canManageMember(as("primary_owner"), as("owner")), true);
  assert.equal(canManageMember(as("owner"), as("owner")), false);
  assert.equal(canManageMember(as("owner"), as("admin")), true);
  assert.equal(canManageMember(as("admin"), as("admin")), false);
  assert.equal(canManageMember(as("admin"), as("user")), true);
  assert.equal(canManageMember(as("user"), as("user")), false);
  // A Client manages nobody.
  assert.equal(canManageMember(as("admin", "c1"), as("user")), false);
  assert.deepEqual(rolesBelow(as("primary_owner")), ["owner", "admin", "user"]);
  assert.deepEqual(rolesBelow(as("owner")), ["admin", "user"]);
  assert.deepEqual(rolesBelow(as("admin")), ["user"]);
  assert.deepEqual(rolesBelow(as("user")), []);
});
