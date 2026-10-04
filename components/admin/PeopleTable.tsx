"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdminMembership, AdminPerson, PersonStatus } from "@/lib/admin/people";

const STATUS_TONE: Record<PersonStatus, string> = { Active: "green", Invited: "grey", Deactivated: "rose" };

export function formatWhen(value: string | null, empty = "Never") {
  if (!value) return empty;
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function StatusTag({ status }: { status: PersonStatus }) {
  return <span className={`tag ${STATUS_TONE[status]}`}>{status}</span>;
}

export function clientsLabel(m: AdminMembership) {
  if (m.clients === null) return "All clients";
  return m.clients.length ? m.clients.join(", ") : "No clients";
}

// The admin area's people (view-only). Across Frank, each person's agencies
// and roles; in one agency (agencyId, on its narrower page), their role,
// status and clients there, with the email under the name. The whole row
// opens the person, like the Agencies table.
export function PeopleTable({ people, agencyId }: { people: AdminPerson[]; agencyId?: string }) {
  const router = useRouter();
  return (
    <table className="admintbl">
      <thead>
        <tr>
          <th>Name</th>
          {agencyId ? (
            <>
              <th>Role</th>
              <th>Status</th>
              <th>Clients</th>
            </>
          ) : (
            <>
              <th>Email</th>
              <th>Agencies</th>
            </>
          )}
          <th>Last signed in</th>
          {!agencyId && <th>Joined</th>}
        </tr>
      </thead>
      <tbody>
        {people.map((p) => {
          const here = agencyId ? p.memberships.find((m) => m.agencyId === agencyId) : undefined;
          return (
            <tr key={p.id} className="admintbl-row" onClick={() => router.push(`/admin/users/${p.id}`)}>
              <td>
                <Link href={`/admin/users/${p.id}`} className="admintbl-name" onClick={(e) => e.stopPropagation()}>
                  {p.name}
                </Link>
                {agencyId && <span className="tdim">{p.email}</span>}
                {p.isPlatformAdmin && <span className="tdim">Platform admin</span>}
              </td>
              {here ? (
                <>
                  <td>{here.typeLabel}</td>
                  <td>
                    <StatusTag status={here.status} />
                  </td>
                  <td>{clientsLabel(here)}</td>
                </>
              ) : (
                <>
                  <td>{p.email}</td>
                  <td>
                    {p.memberships.length === 0 ? (
                      <span className="tdim">None</span>
                    ) : (
                      p.memberships.map((m) => (
                        <span className="tline" key={m.membershipId}>
                          {m.agencyName}
                          {m.agencySubdomain && <span className="tdim-inline"> ({m.agencySubdomain})</span>} · {m.typeLabel}
                          {m.status !== "Active" && <span className="tdim-inline"> · {m.status}</span>}
                        </span>
                      ))
                    )}
                  </td>
                </>
              )}
              <td className="tnowrap">{formatWhen(p.lastSignInAt)}</td>
              {!agencyId && <td className="tnowrap">{formatWhen(p.createdAt)}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
