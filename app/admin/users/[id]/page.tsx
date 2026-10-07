"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useAdminUser } from "@/hooks/use-admin-users";
import { useAdminAction } from "@/hooks/use-admin-actions";
import { AdminActionModal } from "@/components/admin/AdminActionModal";
import { InviteLinks } from "@/components/team/InviteLinks";
import type { AdminPersonDetail } from "@/lib/admin/people";
import { INVITABLE_ROLES, ROLE_LABELS, type InvitableRole } from "@/lib/roles";
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

type Membership = AdminPersonDetail["memberships"][number];
type Acting = { kind: "reset" } | { kind: "resend"; m: Membership } | { kind: "role"; m: Membership };

// One person: their details, and in each agency their role, status,
// clients, projects and any pending invite. The admin can resend an invite,
// send a password reset or change a role, each with a reason that's logged
// for the agency (phase51).
export default function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: person, isLoading, error } = useAdminUser(id);
  const act = useAdminAction<{ ok?: true; url?: string; emailError?: string }>();
  const [acting, setActing] = useState<Acting | null>(null);
  const [done, setDone] = useState<{
    text: string;
    link?: { email: string; name: string; url: string; emailError?: string };
  } | null>(null);
  const [resetAgency, setResetAgency] = useState("");
  const [newRole, setNewRole] = useState<InvitableRole>("admin");
  const active = (person?.memberships ?? []).filter((m) => m.status !== "Deactivated" && m.agencySubdomain);

  function open(next: Acting) {
    act.reset();
    setDone(null);
    if (next.kind === "reset") setResetAgency(active[0]?.agencyId ?? "");
    if (next.kind === "role") setNewRole(INVITABLE_ROLES.find((r) => r !== next.m.type) ?? "admin");
    setActing(next);
  }

  function confirm(reason: string) {
    if (!acting || !person) return;
    const onDone = (text: string, link?: { url?: string; emailError?: string }) => {
      setActing(null);
      setDone({
        text,
        link: link?.url
          ? { email: person.email, name: person.name, url: link.url, emailError: link.emailError }
          : undefined,
      });
    };
    if (acting.kind === "reset") {
      act.mutate(
        { url: `/api/admin/users/${person.id}/password-reset`, body: { agencyId: resetAgency, reason } },
        { onSuccess: () => onDone(`Password reset sent to ${person.email}`) },
      );
    } else if (acting.kind === "resend") {
      act.mutate(
        { url: `/api/admin/members/${acting.m.membershipId}/resend`, body: { reason } },
        { onSuccess: (r) => onDone(`Invite to ${acting.m.agencyName} resent`, r) },
      );
    } else {
      act.mutate(
        { url: `/api/admin/members/${acting.m.membershipId}/role`, body: { role: newRole, reason } },
        { onSuccess: () => onDone(`Now ${ROLE_LABELS[newRole]} at ${acting.m.agencyName}`) },
      );
    }
  }

  return (
    <div className="adminform">
      {/* The menu's own arrow, level with the one above Dashboard. */}
      <Link href="/admin/users" className="reviewnav-toggle adminback" aria-label="Back to users" title="Back to users">
        <svg viewBox="0 0 24 24">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </Link>
      {isLoading && <p className="sub">Frank is working…</p>}
      {error && <p className="autherr">{errorMessage(error, "Couldn't load this person")}</p>}
      {person && (
        <>
          <h1 className="h1">{person.name}</h1>
          <p className="sub">
            {person.email} · joined {formatWhen(person.createdAt)} · last signed in{" "}
            {formatWhen(person.lastSignInAt, "never")}
            {person.isPlatformAdmin && " · platform admin"}
          </p>
          {active.length > 0 && (
            <div className="adminactions">
              <button type="button" className="btn sm" onClick={() => open({ kind: "reset" })}>
                Send Password Reset
              </button>
            </div>
          )}
          {done && (
            <div className="admindone">
              <p className="bsaved" role="status">
                {done.text}. It&rsquo;s in the agency&rsquo;s support log.
              </p>
              {done.link && <InviteLinks sent={[done.link]} />}
            </div>
          )}

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
                  {m.invite.expired
                    ? `expired ${formatWhen(m.invite.expiresAt)}`
                    : `expires ${formatWhen(m.invite.expiresAt)}`}
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
              {(m.status === "Invited" || (m.type !== "client" && m.type !== "primary_owner")) && (
                <div className="adminactions inpanel">
                  {m.status === "Invited" && (
                    <button type="button" className="btn sm" onClick={() => open({ kind: "resend", m })}>
                      Resend Invite
                    </button>
                  )}
                  {m.type !== "client" && m.type !== "primary_owner" && (
                    <button type="button" className="btn sm" onClick={() => open({ kind: "role", m })}>
                      Change Role
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {acting?.kind === "reset" && (
            <AdminActionModal
              title="Send a Password Reset"
              message={`${person.name} gets an email with a link to set a new password, on the agency's address you choose.`}
              confirmLabel="Send Reset"
              isPending={act.isPending}
              error={act.error}
              onConfirm={confirm}
              onClose={() => setActing(null)}
            >
              <div className="field">
                <label htmlFor="adAgency">Agency</label>
                <select id="adAgency" value={resetAgency} onChange={(e) => setResetAgency(e.target.value)}>
                  {active.map((m) => (
                    <option key={m.agencyId} value={m.agencyId}>
                      {m.agencyName} ({m.agencySubdomain})
                    </option>
                  ))}
                </select>
              </div>
            </AdminActionModal>
          )}
          {acting?.kind === "resend" && (
            <AdminActionModal
              title="Resend the Invite"
              message={`A new link to join ${acting.m.agencyName} goes to ${person.email}. The old one stops working.`}
              confirmLabel="Resend Invite"
              isPending={act.isPending}
              error={act.error}
              onConfirm={confirm}
              onClose={() => setActing(null)}
            />
          )}
          {acting?.kind === "role" && (
            <AdminActionModal
              title="Change Their Role"
              message={`${person.name} is ${acting.m.typeLabel} at ${acting.m.agencyName}. Owners and Admins see every client; a User sees only the clients the agency gives them.`}
              confirmLabel="Change Role"
              isPending={act.isPending}
              error={act.error}
              onConfirm={confirm}
              onClose={() => setActing(null)}
            >
              <div className="field">
                <label htmlFor="adRole">New role</label>
                <select id="adRole" value={newRole} onChange={(e) => setNewRole(e.target.value as InvitableRole)}>
                  {INVITABLE_ROLES.filter((r) => r !== acting.m.type).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
            </AdminActionModal>
          )}
        </>
      )}
    </div>
  );
}
