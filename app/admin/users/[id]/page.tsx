"use client";

import { use } from "react";
import Link from "next/link";
import { useAdminUser } from "@/hooks/use-admin-users";
import { StatusTag, clientsLabel, formatWhen } from "@/components/admin/PeopleTable";
import { errorMessage } from "@/lib/errors";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="srow">
      <span className="sl">
        <b>{label}</b>
      </span>
      <span className="srow-v">{children}</span>
    </div>
  );
}

// One person (view-only): their details, and in each agency their role,
// status, clients, projects and any pending invite.
export default function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: person, isLoading, error } = useAdminUser(id);

  return (
    <div className="adminform">
      {/* The menu's own arrow, level with the one above Dashboard. */}
      <Link href="/admin/users" className="reviewnav-toggle adminback" aria-label="Back to users" title="Back to users">
        <svg viewBox="0 0 24 24">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </Link>
      {isLoading && <p className="sub">Loading…</p>}
      {error && <p className="autherr">{errorMessage(error, "Couldn't load this person")}</p>}
      {person && (
        <>
          <h1 className="h1">{person.name}</h1>
          <p className="sub">
            {person.email} · joined {formatWhen(person.createdAt)} · last signed in{" "}
            {formatWhen(person.lastSignInAt, "never")}
            {person.isPlatformAdmin && " · platform admin"}
          </p>

          <div className="msection-h">Details</div>
          <div className="panel">
            <Row label="First name">{person.firstName || "—"}</Row>
            <Row label="Last name">{person.lastName || "—"}</Row>
            <Row label="Designation">{person.designation || "—"}</Row>
            <Row label="Email">{person.email}</Row>
          </div>

          <div className="msection-h">Agencies</div>
          {person.memberships.length === 0 && <p className="msection-d">Not in any agency.</p>}
          {person.memberships.map((m) => (
            <div className="panel adminperson" key={m.membershipId}>
              <div className="panel-h">
                <b>
                  <Link href={`/admin/agencies/${m.agencyId}`} className="admintbl-name">
                    {m.agencyName}
                  </Link>
                </b>
                {m.agencySubdomain && <span className="tdim-inline">{m.agencySubdomain}</span>}
                <span className="sync">{m.typeLabel}</span>
                <StatusTag status={m.status} />
              </div>
              <Row label="Invited">
                {[m.invitedAt ? formatWhen(m.invitedAt) : null, m.invitedBy ? `by ${m.invitedBy}` : null]
                  .filter(Boolean)
                  .join(" ") || "—"}
              </Row>
              <Row label="Joined">{m.acceptedAt ? formatWhen(m.acceptedAt) : "Not yet"}</Row>
              {m.invite && (
                <Row label="Invite link">
                  Sent {formatWhen(m.invite.sentAt)} ·{" "}
                  {m.invite.expired ? `expired ${formatWhen(m.invite.expiresAt)}` : `expires ${formatWhen(m.invite.expiresAt)}`}
                </Row>
              )}
              <Row label="Clients">{clientsLabel(m)}</Row>
              <Row label="Projects">
                {m.projects === null ? (
                  "All projects"
                ) : m.projects.length === 0 ? (
                  "None"
                ) : (
                  <span className="adminlist">
                    {m.projects.map((p) => (
                      <span key={p.id}>
                        {p.clientName} · {p.name}
                        {p.archived && <span className="tdim-inline"> · archived</span>}
                      </span>
                    ))}
                  </span>
                )}
              </Row>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
