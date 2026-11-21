export type AgencyRole = "primary_owner" | "owner" | "admin" | "user" | "finance";

export const ROLE_LABELS: Record<AgencyRole, string> = {
  primary_owner: "Primary Owner",
  owner: "Owner",
  admin: "Admin",
  user: "User",
  finance: "Finance",
};

export const INVITABLE_ROLES = ["owner", "admin", "user"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const ROLE_HINTS: Record<InvitableRole, string> = {
  owner: "Everything an Admin can do, plus adding and managing Admins and Owners.",
  admin: "Sees every client, manages workspace settings, and adds, edits and removes Users and Clients.",
  user: "Sees only the clients you pick below.",
};

// Everyone above User sees every client in the agency (is_unrestricted_staff).
export function seesAllClients(role: AgencyRole | undefined | null) {
  return role === "admin" || role === "owner" || role === "primary_owner";
}

export function isOwnerOrAbove(role: AgencyRole | undefined | null) {
  return role === "owner" || role === "primary_owner";
}

const ROLE_RANK: Record<AgencyRole, number> = {
  primary_owner: 0,
  owner: 1,
  admin: 2,
  user: 3,
  finance: 4,
};

export function byRoleSeniority(a: AgencyRole, b: AgencyRole) {
  return ROLE_RANK[a] - ROLE_RANK[b];
}

// Who can be invited (phase44): the agency's roles, plus Client — someone at
// one client (a membership tied to it), who sees that client's work and its
// public comments only, and doesn't use a team place.
export type InviteRole = InvitableRole | "client";

export const INVITE_ROLE_LABELS: Record<InviteRole, string> = {
  owner: "Owner",
  admin: "Admin",
  user: "User",
  client: "Client",
};

export const INVITE_ROLE_HINTS: Record<InviteRole, string> = {
  owner: "Everything an Admin can do, plus adding and managing Admins and Owners.",
  admin: "Sees every client, manages workspace settings, and adds, edits and removes Users and Clients.",
  user: "Sees only the clients they're given.",
  client: "Someone at the client. Sees this client's work and public comments only, like a review link, and doesn't use a team place.",
};

// The roles this person may give: an Owner any but Primary Owner; every
// Admin, Users and Clients (phase163, decided directly 20 Nov 2026: no
// longer only an Admin an Owner let invite, nor Admins); anyone else, none.
// can_invite_people(), the invite route and the memberships policies
// enforce the same.
export function rolesICanInvite(me: { role: AgencyRole; client_id: string | null } | null | undefined): InviteRole[] {
  if (!me || me.client_id) return [];
  if (isOwnerOrAbove(me.role)) return ["owner", "admin", "user", "client"];
  if (me.role === "admin") return ["user", "client"];
  return [];
}

// Who manages whom (phase49): everyone acts only on people below them —
// the Primary Owner on Owners and down, an Owner on Admins and down, an
// Admin on Users and Clients. A Client ranks as a User. The database's
// role_rank()/can_manage_member() hold the same line.
export function roleRank(role: AgencyRole): number {
  return role === "primary_owner" ? 0 : role === "owner" ? 1 : role === "admin" ? 2 : 3;
}

export function canManageMember(
  me: { role: AgencyRole; client_id: string | null } | null | undefined,
  target: { role: AgencyRole },
) {
  if (!me || me.client_id || roleRank(me.role) > 2) return false;
  return roleRank(target.role) > roleRank(me.role);
}

// The team roles this person can give: those below their own.
export function rolesBelow(me: { role: AgencyRole; client_id: string | null } | null | undefined): InvitableRole[] {
  if (!me || me.client_id) return [];
  return INVITABLE_ROLES.filter((r) => roleRank(r) > roleRank(me.role));
}
