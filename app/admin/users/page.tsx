"use client";

import { useMemo, useState } from "react";
import { useAdminUsers } from "@/hooks/use-admin-users";
import { PeopleTable } from "@/components/admin/PeopleTable";
import { AdminFilterMenu } from "@/components/admin/AdminFilterMenu";
import { ROLE_LABELS } from "@/lib/roles";
import type { AdminMembership, AdminPerson, PersonStatus } from "@/lib/admin/people";
import { SearchIcon } from "@/components/app-shell/icons";
import { errorMessage } from "@/lib/errors";

// Everyone on Frank, with their agencies and roles (decided directly,
// 4 Oct 2026). View-only: a person's page has the rest.
export default function AdminUsersPage() {
  const { data: people, isLoading, error } = useAdminUsers();
  const [query, setQuery] = useState("");
  // The filters (direct instruction: multi-select dropdowns); null is
  // everything ticked, so a workspace made since is in too.
  const [workspaces, setWorkspaces] = useState<string[] | null>(null);
  const [roles, setRoles] = useState<MemberType[] | null>(null);
  const [statuses, setStatuses] = useState<PersonStatus[] | null>(null);
  const [signedIn, setSignedIn] = useState<SignedIn[] | null>(null);
  const workspaceOptions = useMemo(() => {
    const byId = new Map<string, AdminMembership>();
    for (const p of people ?? []) for (const m of p.memberships) byId.set(m.agencyId, m);
    return [...byId.values()]
      .sort((a, b) => a.agencyName.localeCompare(b.agencyName))
      .map((m) => ({ value: m.agencyId, label: m.agencySubdomain ? `${m.agencyName} (${m.agencySubdomain})` : m.agencyName }));
  }, [people]);
  const [now] = useState(() => Date.now());
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (people ?? []).filter((p) => {
      if (
        q &&
        !(
          p.name.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q) ||
          p.memberships.some((m) => m.agencyName.toLowerCase().includes(q) || (m.agencySubdomain ?? "").toLowerCase().includes(q))
        )
      )
        return false;
      if (signedIn && !signedIn.includes(signedInBand(p, now))) return false;
      // Workspace, role and status hold on one membership together: an
      // Admin at one workspace who's a Client at another isn't a Client
      // at the first.
      if (!workspaces && !roles && !statuses) return true;
      return p.memberships.some(
        (m) =>
          (!workspaces || workspaces.includes(m.agencyId)) &&
          (!roles || roles.includes(m.type)) &&
          (!statuses || statuses.includes(m.status)),
      );
    });
  }, [people, query, workspaces, roles, statuses, signedIn, now]);
  const filtered = !!(query.trim() || workspaces || roles || statuses || signedIn);
  // Everything ticked is no filter.
  const set =
    <T,>(setter: (v: T[] | null) => void, total: number) =>
    (next: T[]) =>
      setter(next.length === total ? null : next);

  return (
    <>
      <div className="adminhead">
        <div>
          <h1 className="h1">Users</h1>
          <p className="sub">
            {people ? `${people.length} ${people.length === 1 ? "person" : "people"} on Frank${filtered ? `, ${shown.length} shown` : ""}.` : " "}
          </p>
        </div>
      </div>
      <div className="listsearch">
        <SearchIcon />
        <input
          placeholder="Search by name, email or workspace"
          aria-label="Search users"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="adminfilters">
        <AdminFilterMenu
          label="Workspace"
          allLabel="All Workspaces"
          plural="Workspaces"
          options={workspaceOptions}
          value={workspaces ?? workspaceOptions.map((o) => o.value)}
          onChange={set(setWorkspaces, workspaceOptions.length)}
        />
        <AdminFilterMenu
          label="Role"
          allLabel="All Roles"
          plural="Roles"
          options={ROLE_OPTIONS}
          value={roles ?? ROLE_OPTIONS.map((o) => o.value)}
          onChange={set(setRoles, ROLE_OPTIONS.length)}
        />
        <AdminFilterMenu
          label="Status"
          allLabel="All Statuses"
          plural="Statuses"
          options={STATUS_OPTIONS}
          value={statuses ?? STATUS_OPTIONS.map((o) => o.value)}
          onChange={set(setStatuses, STATUS_OPTIONS.length)}
        />
        <AdminFilterMenu
          label="Last signed in"
          allLabel="Any Sign-in"
          plural="Sign-ins"
          options={SIGNED_IN_OPTIONS}
          value={signedIn ?? SIGNED_IN_OPTIONS.map((o) => o.value)}
          onChange={set(setSignedIn, SIGNED_IN_OPTIONS.length)}
        />
        {filtered && (
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              setQuery("");
              setWorkspaces(null);
              setRoles(null);
              setStatuses(null);
              setSignedIn(null);
            }}
          >
            Clear Filters
          </button>
        )}
      </div>
      {isLoading && <p className="sub">Frank is working…</p>}
      {error && <p className="autherr">{errorMessage(error, "Couldn't load the users")}</p>}
      {people && (shown.length ? <PeopleTable people={shown} /> : <p className="sub">Nobody matches that.</p>)}
    </>
  );
}

type MemberType = AdminMembership["type"];
const ROLE_OPTIONS: { value: MemberType; label: string }[] = [
  ...(["primary_owner", "owner", "admin", "user", "finance"] as const).map((r) => ({ value: r, label: ROLE_LABELS[r] })),
  { value: "client", label: "Client" },
];
const STATUS_OPTIONS: { value: PersonStatus; label: string }[] = [
  { value: "Active", label: "Active" },
  { value: "Invited", label: "Invited" },
  { value: "Deactivated", label: "Deactivated" },
];

// When someone last signed in, in bands.
type SignedIn = "week" | "month" | "earlier" | "never";
const SIGNED_IN_OPTIONS: { value: SignedIn; label: string }[] = [
  { value: "week", label: "In the last 7 days" },
  { value: "month", label: "8 to 30 days ago" },
  { value: "earlier", label: "Over 30 days ago" },
  { value: "never", label: "Never" },
];
function signedInBand(p: AdminPerson, now: number): SignedIn {
  if (!p.lastSignInAt) return "never";
  const days = (now - new Date(p.lastSignInAt).getTime()) / 86_400_000;
  return days <= 7 ? "week" : days <= 30 ? "month" : "earlier";
}
