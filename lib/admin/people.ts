import type { SupabaseClient } from "@supabase/supabase-js";
import { ROLE_LABELS, type AgencyRole } from "@/lib/roles";

// Everyone on Frank, for the platform admin's Users page and each agency's
// People (decided directly, 4 Oct 2026). View-only. Read with the service
// role, after requirePlatformAdmin(), so across every agency.

export type PersonStatus = "Active" | "Invited" | "Deactivated";

export interface AdminMembership {
  membershipId: string;
  agencyId: string;
  agencyName: string;
  // Its address, so two agencies with the same name can be told apart.
  agencySubdomain: string | null;
  // A Client is a 'user' membership tied to a client.
  type: AgencyRole | "client";
  typeLabel: string;
  status: PersonStatus;
  invitedAt: string | null;
  acceptedAt: string | null;
  // Their clients' names; null for everyone above User (they see them all).
  clients: string[] | null;
  // How many projects they're on; null for everyone above User.
  projectCount: number | null;
}

export interface AdminPerson {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  isPlatformAdmin: boolean;
  memberships: AdminMembership[];
}

export interface AdminPersonDetail extends AdminPerson {
  firstName: string | null;
  lastName: string | null;
  designation: string | null;
  memberships: (AdminMembership & {
    invitedBy: string | null;
    // Projects they're on, by client; null for everyone above User.
    projects: { id: string; name: string; clientName: string; archived: boolean }[] | null;
    // A pending invite's latest link.
    invite: { sentAt: string; expiresAt: string; expired: boolean } | null;
  })[];
}

type Row = Record<string, unknown>;

// PostgREST returns at most 1,000 rows a request; read every page.
export async function all<T extends Row>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export async function lastSignIns(admin: SupabaseClient) {
  const seen = new Map<string, string | null>();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    for (const u of data.users) seen.set(u.id, u.last_sign_in_at ?? null);
    if (data.users.length < 1000) return seen;
  }
}

const statusOf = (m: { accepted_at: string | null; removed_at: string | null }): PersonStatus =>
  m.removed_at ? "Deactivated" : m.accepted_at ? "Active" : "Invited";

const seesAll = (role: AgencyRole) => role === "primary_owner" || role === "owner" || role === "admin";

export async function loadPeople(admin: SupabaseClient, onlyUserId?: string): Promise<AdminPerson[]> {
  const [users, memberships, agencies, clients, grants, access, signIns, platformAdmins] = await Promise.all([
    all<Row>((f, t) => {
      const q = admin.from("users").select("id, name, email, created_at");
      return (onlyUserId ? q.eq("id", onlyUserId) : q).order("created_at").range(f, t);
    }),
    all<Row>((f, t) => {
      const q = admin
        .from("memberships")
        .select("id, agency_id, user_id, role, client_id, invited_at, accepted_at, removed_at")
        .is("removed_permanently_at", null);
      return (onlyUserId ? q.eq("user_id", onlyUserId) : q).range(f, t);
    }),
    all<Row>((f, t) => admin.from("agencies").select("id, name, subdomain").range(f, t)),
    all<Row>((f, t) => admin.from("clients").select("id, name").range(f, t)),
    all<Row>((f, t) => admin.from("staff_client_access").select("membership_id, client_id").range(f, t)),
    all<Row>((f, t) => admin.from("project_access").select("membership_id").range(f, t)),
    lastSignIns(admin),
    all<Row>((f, t) => admin.from("platform_admins").select("user_id").range(f, t)),
  ]);

  const agencyName = new Map(agencies.map((a) => [a.id as string, a.name as string]));
  const agencySubdomain = new Map(agencies.map((a) => [a.id as string, a.subdomain as string | null]));
  const clientName = new Map(clients.map((c) => [c.id as string, c.name as string]));
  const admins = new Set(platformAdmins.map((p) => p.user_id as string));
  const projectCount = new Map<string, number>();
  for (const a of access) projectCount.set(a.membership_id as string, (projectCount.get(a.membership_id as string) ?? 0) + 1);

  return users.map((u) => ({
    id: u.id as string,
    name: (u.name as string) || (u.email as string),
    email: u.email as string,
    createdAt: u.created_at as string,
    lastSignInAt: signIns.get(u.id as string) ?? null,
    isPlatformAdmin: admins.has(u.id as string),
    memberships: memberships
      .filter((m) => m.user_id === u.id)
      .map((m) => {
        const role = m.role as AgencyRole;
        const clientId = m.client_id as string | null;
        const everything = seesAll(role) && !clientId;
        return {
          membershipId: m.id as string,
          agencyId: m.agency_id as string,
          agencyName: agencyName.get(m.agency_id as string) ?? "Unknown agency",
          agencySubdomain: agencySubdomain.get(m.agency_id as string) ?? null,
          type: clientId ? ("client" as const) : role,
          typeLabel: clientId ? "Client" : ROLE_LABELS[role],
          status: statusOf(m as { accepted_at: string | null; removed_at: string | null }),
          invitedAt: m.invited_at as string | null,
          acceptedAt: m.accepted_at as string | null,
          clients: everything
            ? null
            : clientId
              ? [clientName.get(clientId) ?? "Unknown client"]
              : grants
                  .filter((g) => g.membership_id === m.id)
                  .map((g) => clientName.get(g.client_id as string) ?? "Unknown client")
                  .sort((a, b) => a.localeCompare(b)),
          projectCount: everything ? null : (projectCount.get(m.id as string) ?? 0),
        };
      })
      .sort((a, b) => a.agencyName.localeCompare(b.agencyName)),
  }));
}

export async function loadPersonDetail(admin: SupabaseClient, userId: string): Promise<AdminPersonDetail | null> {
  const [person] = await loadPeople(admin, userId);
  if (!person) return null;
  const membershipIds = person.memberships.map((m) => m.membershipId);
  const [{ data: profile }, memberships, access, invites] = await Promise.all([
    admin.from("users").select("first_name, last_name, designation").eq("id", userId).single(),
    membershipIds.length
      ? all<Row>((f, t) => admin.from("memberships").select("id, invited_by").in("id", membershipIds).range(f, t))
      : Promise.resolve([] as Row[]),
    membershipIds.length
      ? all<Row>((f, t) =>
          admin.from("project_access").select("membership_id, project_id").in("membership_id", membershipIds).range(f, t),
        )
      : Promise.resolve([] as Row[]),
    membershipIds.length
      ? all<Row>((f, t) =>
          admin
            .from("invites")
            .select("membership_id, created_at, expires_at")
            .in("membership_id", membershipIds)
            .is("accepted_at", null)
            .order("created_at", { ascending: false })
            .range(f, t),
        )
      : Promise.resolve([] as Row[]),
  ]);

  const inviterIds = [...new Set(memberships.map((m) => m.invited_by as string | null).filter((x): x is string => !!x))];
  const projectIds = [...new Set(access.map((a) => a.project_id as string))];
  const [{ data: inviters }, { data: projects }] = await Promise.all([
    inviterIds.length
      ? admin.from("users").select("id, name").in("id", inviterIds)
      : Promise.resolve({ data: [] as Row[] }),
    projectIds.length
      ? admin.from("projects").select("id, name, archived_at, clients(name)").in("id", projectIds)
      : Promise.resolve({ data: [] as Row[] }),
  ]);
  const inviterName = new Map((inviters ?? []).map((u) => [u.id as string, u.name as string]));
  const project = new Map((projects ?? []).map((p) => [p.id as string, p]));
  const now = Date.now();

  return {
    ...person,
    firstName: (profile?.first_name as string | null) ?? null,
    lastName: (profile?.last_name as string | null) ?? null,
    designation: (profile?.designation as string | null) ?? null,
    memberships: person.memberships.map((m) => {
      const invitedBy = memberships.find((r) => r.id === m.membershipId)?.invited_by as string | null;
      const latest = m.status === "Invited" ? invites.find((i) => i.membership_id === m.membershipId) : undefined;
      return {
        ...m,
        invitedBy: invitedBy ? (inviterName.get(invitedBy) ?? null) : null,
        projects:
          m.projectCount === null
            ? null
            : access
                .filter((a) => a.membership_id === m.membershipId)
                .map((a) => project.get(a.project_id as string))
                .filter((p): p is Row => !!p)
                .map((p) => ({
                  id: p.id as string,
                  name: p.name as string,
                  clientName: ((p.clients as { name: string } | null)?.name as string) ?? "Unknown client",
                  archived: !!p.archived_at,
                }))
                .sort((a, b) => a.clientName.localeCompare(b.clientName) || a.name.localeCompare(b.name)),
        invite: latest
          ? {
              sentAt: latest.created_at as string,
              expiresAt: latest.expires_at as string,
              expired: new Date(latest.expires_at as string).getTime() < now,
            }
          : null,
      };
    }),
  };
}
