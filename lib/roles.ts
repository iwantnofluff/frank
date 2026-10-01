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
  owner: "Everything an Admin can do, plus inviting people and choosing their roles.",
  admin: "Sees every client and manages agency settings.",
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
