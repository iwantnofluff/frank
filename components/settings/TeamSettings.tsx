"use client";

import Link from "next/link";
import { useState } from "react";
import { useClients } from "@/hooks/use-clients";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { useClientMembers, type ClientMemberRow } from "@/hooks/use-client-members";
import { useTeamMembers, type TeamMemberRow } from "@/hooks/use-team-members";
import { useStaffClientAccess } from "@/hooks/use-staff-client-access";
import { useAvatarUrls } from "@/hooks/use-avatar-urls";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { initials } from "@/lib/initials";
import { avatarColour } from "@/lib/avatar-colour";
import { useRemoveMember, useRevokeInvite, useSetCanInvite, useSetMemberActive } from "@/hooks/use-manage-member";
import { InviteMemberModal } from "@/components/team/InviteMemberModal";
import { InviteSentModal } from "@/components/team/InviteSentModal";
import { useResendInvite, type SentInvite } from "@/hooks/use-invite-member";
import { ClientAccessMenu } from "@/components/team/ClientAccessMenu";
import { RemoveMemberConfirm } from "@/components/team/RemoveMemberConfirm";
import { RoleMenu } from "@/components/ui/RoleMenu";
import { useUpdateMember } from "@/hooks/use-manage-member";
import { errorMessage } from "@/lib/errors";
import {
  ROLE_LABELS,
  canManageMember,
  isOwnerOrAbove,
  rolesBelow,
  rolesICanInvite,
  seesAllClients,
  type InvitableRole,
} from "@/lib/roles";

// Last column matches the dashboard's and client workspace's row menus
// (70px, right-aligned) so the "..." sits in the same place on every list.
// The Role column holds the dropdown (direct instruction, in place of the
// row's ⋮ menu), so there's no column after Status.
// Clients further left, Email narrower for it, and room after it before
// Role (direct instruction).
// Date Added after Clients (direct instruction), Clients narrower for it,
// and Role and Status further right.
const PEOPLE_COLUMNS_WITH_CLIENTS = "1.1fr 1fr 1fr 104px 132px 104px";
const PEOPLE_COLUMNS = "1fr 1.3fr 104px 150px 140px";
// Total Members a little in from the edge, and more room between the two
// lists of members (direct instruction).
const CLIENT_VIEW_COLUMNS = "1fr 1.5fr 1.5fr 130px";

export type View = "people" | "clients";

type PeopleSort = "default" | "name-asc" | "name-desc" | "date-asc" | "date-desc";

// When someone was added (direct instruction: a Date Added column): when
// they were invited, or, for whoever wasn't (the workspace's founder),
// when they joined.
function addedAt(m: { invited_at?: string | null; accepted_at: string | null }): string | null {
  return m.invited_at ?? m.accepted_at ?? null;
}
function addedOn(m: { invited_at?: string | null; accepted_at: string | null }): string {
  const at = addedAt(m);
  return at ? new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

// Under "Invited" (direct instruction: say when someone hasn't joined): until
// when their link works, or that it's expired and needs resending. Only
// for viewers allowed to see invites (Owners, and whoever manages them).
function inviteNote(
  m: Pick<TeamMemberRow, "accepted_at" | "invite"> & { removed_at?: string | null },
  now: number,
): { text: string; late: boolean } | null {
  if (m.accepted_at || m.removed_at) return null;
  if (!m.invite) return null;
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return new Date(m.invite.expires_at).getTime() < now
    ? { text: `Link expired ${day(m.invite.expires_at)}. Resend it`, late: true }
    : { text: `Link works until ${day(m.invite.expires_at)}`, late: false };
}

function statusOf(m: TeamMemberRow) {
  if (m.removed_at) return { label: "Deactivated", tone: "rose" };
  if (!m.accepted_at) return { label: "Invited", tone: "grey" };
  return { label: "Active", tone: "green" };
}

// Settings → Team → Users ("people") and Clients ("clients") — what were
// the By Person and By Client pills, now the two pages in the menu.
export function TeamSettings({ view }: { view: View }) {
  const { data: me } = useCurrentUser();
  const { data: agency } = useMyAgency();
  const agencyId = agency?.agencyId;
  const { data: myMembership } = useMyMembership(agencyId);
  const isStaff = myMembership?.client_id === null;
  // Everyone acts on the people below them (phase49). Deactivating,
  // removing and the "Can invite" switch stay an Owner's.
  const isOwner = isStaff && isOwnerOrAbove(myMembership?.role);
  // Who may invite, and as what (phase44): Owners, and Admins they've let.
  const inviteRoles = rolesICanInvite(myMembership);
  // Client grants are only readable by Admin and above (RLS), so the Clients
  // column and client view are only offered to them.
  const canSeeAccess = isStaff && seesAllClients(myMembership?.role);

  const { data: members, isLoading, isError, dataUpdatedAt } = useTeamMembers(agencyId);
  // Read on both pages now: Users lists them under the team (direct
  // instruction). Admins and above only, as Team → Clients is.
  const { data: clientMembers, refetch: refetchClientMembers } = useClientMembers(agencyId, canSeeAccess);
  const { data: clients } = useClients();
  const { data: access } = useStaffClientAccess(agencyId, canSeeAccess);
  const { data: photos } = useAvatarUrls((members ?? []).map((m) => m.user?.avatar_asset_id));
  const setActive = useSetMemberActive(agencyId ?? "");
  const remove = useRemoveMember(agencyId ?? "");
  const revoke = useRevokeInvite(agencyId ?? "");
  const resend = useResendInvite();
  const [resent, setResent] = useState<SentInvite | null>(null);
  const setCanInvite = useSetCanInvite(agencyId ?? "");

  const [inviting, setInviting] = useState(false);
  const [peopleFilter, setPeopleFilter] = useState<"all" | "team" | "client">("all");
  const [peopleSort, setPeopleSort] = useState<PeopleSort>("default");
  const [notice, setNotice] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TeamMemberRow | null>(null);
  const updateMember = useUpdateMember(agency?.agencyId ?? "");

  const activeClients = (clients ?? []).filter((c) => !c.archived_at);
  const clientName = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const grantsFor = (membershipId: string) =>
    (access ?? []).filter((a) => a.membership_id === membershipId).map((a) => a.client_id);

  function displayName(m: TeamMemberRow) {
    return m.user?.name ?? m.user?.email ?? "This member";
  }

  function actionsFor(m: TeamMemberRow) {
    if (!myMembership || m.user_id === me?.id || !canManageMember(myMembership, m)) return null;
    // No Edit (direct instruction): a User's clients are added under their
    // names in the Clients column, and a role is picked straight away.
    if (!m.accepted_at && !m.removed_at) {
      return [
        {
          label: "Resend Invite",
          onClick: () =>
            resend.mutate(
              { membershipId: m.id, email: m.user?.email ?? "", name: displayName(m) },
              {
                onSuccess: (sent) => {
                  setNotice(null);
                  setResent(sent);
                },
              },
            ),
        },
        {
          label: "Revoke Invite",
          tone: "danger" as const,
          onClick: () =>
            revoke.mutate(m.id, { onSuccess: () => setNotice(`Invite to ${m.user?.email} revoked`) }),
        },
      ];
    }
    if (!isOwner) return [];
    if (m.removed_at) {
      return [
        {
          label: "Reactivate",
          onClick: () =>
            setActive.mutate(
              { membershipId: m.id, active: true },
              { onSuccess: () => setNotice(`${displayName(m)} reactivated`) },
            ),
        },
        { label: "Remove from Team", tone: "danger" as const, onClick: () => setRemoveTarget(m) },
      ];
    }
    // An Owner lets an active Admin invite people, or stops them.
    const inviteSwitch =
      m.role === "admin"
        ? [
            {
              label: m.can_invite ? "Stop Them Inviting People" : "Let Them Invite People",
              onClick: () =>
                setCanInvite.mutate(
                  { membershipId: m.id, canInvite: !m.can_invite },
                  {
                    onSuccess: () =>
                      setNotice(
                        m.can_invite
                          ? `${displayName(m)} can no longer invite people`
                          : `${displayName(m)} can now invite Admins, Users and Clients`,
                      ),
                  },
                ),
            },
          ]
        : [];
    return [
      ...inviteSwitch,
      {
        label: "Deactivate",
        onClick: () =>
          setActive.mutate(
            { membershipId: m.id, active: false },
            { onSuccess: () => setNotice(`${displayName(m)} deactivated`) },
          ),
      },
      { label: "Remove from Team", tone: "danger" as const, onClick: () => setRemoveTarget(m) },
    ];
  }

  function clientsCell(m: TeamMemberRow) {
    if (seesAllClients(m.role)) return <span style={{ color: "var(--muted)" }}>All clients</span>;
    const grants = grantsFor(m.id);
    // Each opens its client's page, its projects (direct instruction).
    const named = grants
      .map((id) => ({ id, name: clientName.get(id) }))
      .filter((c): c is { id: string; name: string } => !!c.name)
      .sort((a, b) => a.name.localeCompare(b.name));
    const activeIds = new Set(activeClients.map((c) => c.id));
    return (
      <>
        <div>
          {named.length === 0 ? (
            <span style={{ color: "var(--muted)" }}>No clients</span>
          ) : (
            named.map((c, i) => (
              <span key={c.id}>
                {i > 0 && ", "}
                <Link className="clientlink" href={`/clients/${c.id}`}>
                  {c.name}
                </Link>
              </span>
            ))
          )}
        </div>
        {/* "+ Add Clients" under them (direct instruction), for whoever
            manages them; a deactivated User's stay as they are. */}
        {!!myMembership && canManageMember(myMembership, m) && m.user_id !== me?.id && !m.removed_at && (
          <ClientAccessMenu
            name={displayName(m)}
            clients={activeClients}
            selected={grants.filter((id) => activeIds.has(id))}
            disabled={updateMember.isPending}
            onSave={(ids) => {
              setNotice(null);
              updateMember.mutate(
                {
                  membershipId: m.id,
                  role: "user",
                  roleChanged: false,
                  // An archived client's grant isn't in the list, so it stays.
                  clientIds: [...ids, ...grants.filter((id) => !activeIds.has(id))],
                  currentClientIds: grants,
                },
                { onSuccess: () => setNotice(`${displayName(m)}'s clients updated`) },
              );
            }}
          />
        )}
      </>
    );
  }

  const actionError =
    setActive.error ??
    revoke.error ??
    resend.error ??
    setCanInvite.error ??
    updateMember.error ??
    (removeTarget ? null : remove.error);
  const peopleColumns = canSeeAccess ? PEOPLE_COLUMNS_WITH_CLIENTS : PEOPLE_COLUMNS;

  // The one list (direct instruction): the team in role order, then each
  // client's people by client and name; or as picked.
  const teamCount = members?.length ?? 0;
  const clientCount = canSeeAccess ? (clientMembers?.length ?? 0) : 0;
  type PeopleRow =
    | { kind: "team"; m: TeamMemberRow; name: string; added: string | null }
    | { kind: "client"; m: ClientMemberRow; name: string; added: string | null };
  const peopleRows: PeopleRow[] = (() => {
    const team: PeopleRow[] = (members ?? []).map((m) => ({
      kind: "team",
      m,
      name: m.user?.name || m.user?.email || "",
      added: addedAt(m),
    }));
    const theirs: PeopleRow[] = (canSeeAccess ? (clientMembers ?? []) : [])
      .slice()
      .sort(
        (a, b) =>
          (clientName.get(a.client_id) ?? "").localeCompare(clientName.get(b.client_id) ?? "") ||
          (a.user?.name ?? "").localeCompare(b.user?.name ?? ""),
      )
      .map((m) => ({ kind: "client", m, name: m.user?.name || m.user?.email || "", added: addedAt(m) }));
    const rows = peopleFilter === "team" ? team : peopleFilter === "client" ? theirs : [...team, ...theirs];
    if (peopleSort === "default") return rows;
    const byName = (a: PeopleRow, b: PeopleRow) => a.name.localeCompare(b.name);
    // Undated last either way.
    const byDate = (a: PeopleRow, b: PeopleRow) =>
      (a.added ?? "9999").localeCompare(b.added ?? "9999");
    return [...rows].sort((a, b) =>
      peopleSort === "name-asc"
        ? byName(a, b)
        : peopleSort === "name-desc"
          ? byName(b, a)
          : peopleSort === "date-asc"
            ? byDate(a, b)
            : !a.added ? 1 : !b.added ? -1 : byDate(b, a),
    );
  })();
  // Restricted Users only — everyone above them sees every client anyway.
  const restrictedMembers = (members ?? []).filter((m) => m.role === "user" && !m.removed_at);

  return (
    <div className="pad">
      {/* The workspace's own name (direct instruction): "No Fluff Team Members". */}
      <h1 className="h1">{view === "people" ? `${agency?.name ?? "Workspace"} Team Members` : "Clients"}</h1>
      <p className="sub">
        {view === "people"
          ? `Everyone with access to ${agency?.name ?? "this workspace"}: your team and each client's own people.`
          : "Who can see each client: your team, and the client's own people."}
      </p>

      <div className="secthead" style={{ marginTop: 16 }}>
        {view === "people" ? (
          // All, the workspace's own team, or the clients' people (direct
          // instruction), with how many in each.
          canSeeAccess ? (
            <div className="filters" style={{ marginLeft: 0 }}>
              {(
                [
                  ["all", "All", teamCount + clientCount],
                  ["team", agency?.name ?? "Workspace", teamCount],
                  ["client", "Client", clientCount],
                ] as const
              ).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  className="chip"
                  aria-pressed={peopleFilter === value}
                  onClick={() => setPeopleFilter(value)}
                >
                  {label} ({count})
                </button>
              ))}
            </div>
          ) : (
            <>
              <h2>Team Members</h2>
              <span className="count">
                {teamCount} member{teamCount === 1 ? "" : "s"}
              </span>
            </>
          )
        ) : (
          <>
            <h2>Client Access</h2>
            <span className="count">
              {activeClients.length} client{activeClients.length === 1 ? "" : "s"}
            </span>
          </>
        )}
        <div className="filters">
          {view === "people" && (
            // Name or date added (direct instruction), as the client page's
            // projects are sorted.
            <select
              className="sortsel"
              aria-label="Sort people"
              value={peopleSort}
              onChange={(e) => setPeopleSort(e.target.value as PeopleSort)}
            >
              <option value="default">Team first</option>
              <option value="name-asc">Name A–Z</option>
              <option value="name-desc">Name Z–A</option>
              <option value="date-desc">Newest first</option>
              <option value="date-asc">Oldest first</option>
            </select>
          )}
          {inviteRoles.length > 0 && agency && view === "people" && (
            <button type="button" className="btn sm" onClick={() => setInviting(true)}>
              Invite Member
            </button>
          )}
        </div>
      </div>

      {isError && (
        <div className="empty">
          <b>Couldn&rsquo;t load the team</b>
        </div>
      )}

      {!isError && !isLoading && members?.length === 0 && (
        <div className="empty">
          <b>No team members yet</b>
        </div>
      )}

      {/* One list (direct instruction): the team, then each client's own
          people, with pills for either and a sort. Clients' people only for
          Admins and above, who can read them (as Team, Clients). */}
      {view === "people" && !isError && members && members.length > 0 && (
        <div className="clients">
          <div className="crow head" style={{ gridTemplateColumns: peopleColumns }}>
            <div>Name</div>
            <div>Email</div>
            {canSeeAccess && <div>Clients</div>}
            <div>Date Added</div>
            <div>Role</div>
            <div>Status</div>
          </div>
          {peopleRows.map((row) => {
            if (row.kind === "team") {
              const m = row.m;
            const status = statusOf(m);
            const actions = actionsFor(m);
            return (
              <div
                className="crow"
                key={m.id}
                data-kind="team"
                style={{ gridTemplateColumns: peopleColumns, cursor: "default" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <PersonAvatar
                    className="who"
                    style={{ width: 32, height: 32, fontSize: 12.2, background: avatarColour(m.user?.name ?? "?") }}
                    initials={initials(m.user?.name, m.user?.email ?? "?")}
                    photoUrl={m.user?.avatar_asset_id ? photos?.[m.user.avatar_asset_id] : null}
                    hasPhoto={!!m.user?.avatar_asset_id}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14.7, fontWeight: 500 }}>{m.user?.name ?? "—"}</div>
                    {m.user?.designation && (
                      <div style={{ fontSize: 13.2, color: "var(--muted)" }}>{m.user.designation}</div>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 14.2, color: "var(--muted)", minWidth: 0, overflowWrap: "anywhere" }}>{m.user?.email ?? "—"}</div>
                {canSeeAccess && <div style={{ fontSize: 14.2, paddingRight: 32 }}>{clientsCell(m)}</div>}
                <div style={{ fontSize: 14.2, color: "var(--muted)" }}>{addedOn(m)}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {actions ? (
                    <RoleMenu
                      name={displayName(m)}
                      value={m.role as InvitableRole}
                      current={ROLE_LABELS[m.role] ?? m.role}
                      // A role can't be changed while invited or deactivated;
                      // their other options are still here.
                      options={
                        m.accepted_at && !m.removed_at
                          ? rolesBelow(myMembership).map((r) => ({ value: r, label: ROLE_LABELS[r] }))
                          : []
                      }
                      // Straight away, User too: their clients are then
                      // added in the Clients column.
                      onPick={(role) => {
                        setNotice(null);
                        updateMember.mutate(
                          {
                            membershipId: m.id,
                            role,
                            roleChanged: true,
                            clientIds: [],
                            currentClientIds: grantsFor(m.id),
                          },
                          { onSuccess: () => setNotice(`${displayName(m)} is now ${ROLE_LABELS[role]}`) },
                        );
                      }}
                      extra={actions}
                      disabled={updateMember.isPending}
                    />
                  ) : (
                    <span className="tag blue">{ROLE_LABELS[m.role] ?? m.role}</span>
                  )}
                  {m.role === "admin" && m.can_invite && (
                    <span className="tag" style={{ marginLeft: 6 }}>
                      Can invite
                    </span>
                  )}
                </div>
                <div>
                  <span className={`tag ${status.tone}`}>{status.label}</span>
                  {(() => {
                    const note = inviteNote(m, dataUpdatedAt);
                    return note && <div className={`invnote${note.late ? " late" : ""}`}>{note.text}</div>;
                  })()}
                </div>
              </div>
            );
            }
            const m = row.m;
            const name = m.user?.name || m.user?.email || "Someone";
            const email = m.user?.email ?? "";
            const note = inviteNote(m, dataUpdatedAt);
            return (
              <div className="crow" data-kind="client" key={m.id} style={{ gridTemplateColumns: peopleColumns, cursor: "default" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <PersonAvatar
                    className="who"
                    style={{ width: 32, height: 32, fontSize: 12.2, background: avatarColour(name) }}
                    initials={initials(m.user?.name, email || "?")}
                    photoUrl={null}
                    hasPhoto={false}
                  />
                  <div style={{ fontSize: 14.7, fontWeight: 500, minWidth: 0 }}>{m.user?.name ?? "—"}</div>
                </div>
                <div style={{ fontSize: 14.2, color: "var(--muted)", minWidth: 0, overflowWrap: "anywhere" }}>{email || "—"}</div>
                <div style={{ fontSize: 14.2, paddingRight: 32 }}>
                  <Link className="clientlink" href={`/clients/${m.client_id}`}>
                    {clientName.get(m.client_id) ?? "—"}
                  </Link>
                </div>
                <div style={{ fontSize: 14.2, color: "var(--muted)" }}>{addedOn(m)}</div>
                <div>
                  {m.accepted_at ? (
                    <span className="tag blue">Client</span>
                  ) : (
                    <RoleMenu
                      name={name}
                      value="client"
                      current="Client"
                      options={[]}
                      onPick={() => {}}
                      extra={[
                        {
                          label: "Resend Invite",
                          onClick: () =>
                            resend.mutate(
                              { membershipId: m.id, email, name },
                              {
                                onSuccess: (sent) => {
                                  setNotice(null);
                                  setResent(sent);
                                  void refetchClientMembers();
                                },
                              },
                            ),
                        },
                        {
                          label: "Revoke Invite",
                          tone: "danger" as const,
                          onClick: () =>
                            revoke.mutate(m.id, { onSuccess: () => setNotice(`Invite to ${email} revoked`) }),
                        },
                      ]}
                    />
                  )}
                </div>
                <div>
                  <span className={`tag ${m.accepted_at ? "green" : "grey"}`}>{m.accepted_at ? "Active" : "Invited"}</span>
                  {note && <div className={`invnote${note.late ? " late" : ""}`}>{note.text}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "clients" && !canSeeAccess && (
        <div className="empty">
          <b>Only Admins and Owners can see who has which clients</b>
        </div>
      )}

      {view === "clients" && canSeeAccess && (
        <>
          <p className="sub" style={{ marginTop: 0, marginBottom: 12 }}>
            Internal Members are your team&rsquo;s Users given access to the client (the Primary Owner,
            Owners and Admins see every client). Client Members are the client&rsquo;s own people.
          </p>
          {activeClients.length === 0 ? (
            <div className="empty">
              <b>No clients yet</b>
            </div>
          ) : (
            <div className="clients">
              <div className="crow head" style={{ gridTemplateColumns: CLIENT_VIEW_COLUMNS }}>
                <div>Name</div>
                {/* Named as members (direct instruction). */}
                <div style={{ paddingRight: 24 }}>Internal Members</div>
                <div>Client Members</div>
                <div className="ago" style={{ paddingRight: 16 }}>
                  Total Members
                </div>
              </div>
              {activeClients.map((c) => {
                const withAccess = restrictedMembers
                  .filter((m) => grantsFor(m.id).includes(c.id))
                  .sort((a, b) => displayName(a).localeCompare(displayName(b)));
                // The client's own people, beside the team's (direct instruction).
                const theirs = (clientMembers ?? [])
                  .filter((m) => m.client_id === c.id)
                  .map((m) => ({ name: m.user?.name || m.user?.email || "Someone", joined: !!m.accepted_at }))
                  .sort((a, b) => a.name.localeCompare(b.name));
                return (
                  <div
                    className="crow"
                    key={c.id}
                    style={{ gridTemplateColumns: CLIENT_VIEW_COLUMNS, cursor: "default" }}
                  >
                    {/* Opens the client's page, its projects (direct instruction). */}
                    <div style={{ fontSize: 14.7, fontWeight: 500 }}>
                      <Link className="clientlink" href={`/clients/${c.id}`}>
                        {c.name}
                      </Link>
                    </div>
                    <div style={{ fontSize: 14.2, paddingRight: 24 }}>
                      {withAccess.length === 0 ? (
                        <span style={{ color: "var(--muted)" }}>No Users</span>
                      ) : (
                        withAccess
                          .map((m) => (m.accepted_at ? displayName(m) : `${displayName(m)} (invited)`))
                          .join(", ")
                      )}
                    </div>
                    <div style={{ fontSize: 14.2 }}>
                      {theirs.length === 0 ? (
                        <span style={{ color: "var(--muted)" }}>No Clients</span>
                      ) : (
                        theirs.map((p) => (p.joined ? p.name : `${p.name} (invited)`)).join(", ")
                      )}
                    </div>
                    <div className="ago" style={{ paddingRight: 16 }}>
                      {withAccess.length + theirs.length}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {!!actionError && (
        <p className="autherr">{errorMessage(actionError, "Couldn't change this member")}</p>
      )}
      {notice && (
        <p className="sub" role="status" style={{ marginTop: 12 }}>
          {notice}
        </p>
      )}
      {/* A resent invite's link, in its own window (direct instruction). */}
      {resent && <InviteSentModal sent={resent} onClose={() => setResent(null)} />}

      {inviting && agency && (
        <InviteMemberModal
          agencyId={agency.agencyId}
          roles={inviteRoles}
          onClose={() => setInviting(false)}
          // The modal stays open on its links; the list notes it meanwhile.
          onSent={(email) => setNotice(`Invite sent to ${email}`)}
        />
      )}

      {removeTarget && agency && (
        <RemoveMemberConfirm
          name={displayName(removeTarget)}
          agencyName={agency.name}
          isPending={remove.isPending}
          error={remove.error}
          onClose={() => {
            remove.reset();
            setRemoveTarget(null);
          }}
          onConfirm={() =>
            remove.mutate(removeTarget.id, {
              onSuccess: () => {
                setNotice(`${displayName(removeTarget)} removed from the team`);
                setRemoveTarget(null);
              },
            })
          }
        />
      )}
    </div>
  );
}
