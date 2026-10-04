"use client";

import { useState } from "react";
import { useClients } from "@/hooks/use-clients";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { useTeamMembers, type TeamMemberRow } from "@/hooks/use-team-members";
import { useStaffClientAccess } from "@/hooks/use-staff-client-access";
import { useAvatarUrls } from "@/hooks/use-avatar-urls";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { initials } from "@/lib/initials";
import { avatarColour } from "@/lib/avatar-colour";
import { useRemoveMember, useRevokeInvite, useSetCanInvite, useSetMemberActive } from "@/hooks/use-manage-member";
import { InviteMemberModal } from "@/components/team/InviteMemberModal";
import { InviteLinks } from "@/components/team/InviteLinks";
import { useResendInvite, type SentInvite } from "@/hooks/use-invite-member";
import { EditMemberModal } from "@/components/team/EditMemberModal";
import { RemoveMemberConfirm } from "@/components/team/RemoveMemberConfirm";
import { RowActionsMenu } from "@/components/ui/RowActionsMenu";
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
const PEOPLE_COLUMNS_WITH_CLIENTS = "1fr 1.3fr 1fr 110px 110px 70px";
const PEOPLE_COLUMNS = "1fr 1.3fr 110px 110px 70px";
const CLIENT_VIEW_COLUMNS = "1fr 2fr 90px";

export type View = "people" | "clients";

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
  const editRoles = rolesBelow(myMembership);
  // Who may invite, and as what (phase44): Owners, and Admins they've let.
  const inviteRoles = rolesICanInvite(myMembership);
  // Client grants are only readable by Admin and above (RLS), so the Clients
  // column and client view are only offered to them.
  const canSeeAccess = isStaff && seesAllClients(myMembership?.role);

  const { data: members, isLoading, isError } = useTeamMembers(agencyId);
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
  const [notice, setNotice] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TeamMemberRow | null>(null);
  const [editTarget, setEditTarget] = useState<TeamMemberRow | null>(null);

  const activeClients = (clients ?? []).filter((c) => !c.archived_at);
  const clientName = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const grantsFor = (membershipId: string) =>
    (access ?? []).filter((a) => a.membership_id === membershipId).map((a) => a.client_id);

  function displayName(m: TeamMemberRow) {
    return m.user?.name ?? m.user?.email ?? "This member";
  }

  function actionsFor(m: TeamMemberRow) {
    if (!myMembership || m.user_id === me?.id || !canManageMember(myMembership, m)) return null;
    const edit = { label: "Edit", onClick: () => setEditTarget(m) };
    if (!m.accepted_at && !m.removed_at) {
      return [
        edit,
        {
          label: "Resend Invite",
          onClick: () =>
            resend.mutate(
              { membershipId: m.id, email: m.user?.email ?? "", name: displayName(m) },
              {
                onSuccess: (sent) => {
                  setResent(sent);
                  setNotice(`Invite resent to ${m.user?.email}`);
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
    if (!isOwner) return [edit];
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
      edit,
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
    const names = grantsFor(m.id)
      .map((id) => clientName.get(id))
      .filter((n): n is string => !!n)
      .sort((a, b) => a.localeCompare(b));
    if (names.length === 0) return <span style={{ color: "var(--muted)" }}>No clients</span>;
    return names.join(", ");
  }

  const actionError =
    setActive.error ?? revoke.error ?? resend.error ?? setCanInvite.error ?? (removeTarget ? null : remove.error);
  const peopleColumns = canSeeAccess ? PEOPLE_COLUMNS_WITH_CLIENTS : PEOPLE_COLUMNS;
  // Restricted Users only — everyone above them sees every client anyway.
  const restrictedMembers = (members ?? []).filter((m) => m.role === "user" && !m.removed_at);

  return (
    <div className="pad">
      <h1 className="h1">{view === "people" ? "Users" : "Clients"}</h1>
      <p className="sub">
        {view === "people"
          ? `Everyone with staff access at ${agency?.name ?? "this agency"}.`
          : "Which team members can see each client."}
      </p>

      <div className="secthead" style={{ marginTop: 16 }}>
        <h2>{view === "people" ? "Team Members" : "Client Access"}</h2>
        <span className="count">
          {view === "people"
            ? `${members?.length ?? 0} member${members?.length === 1 ? "" : "s"}`
            : `${activeClients.length} client${activeClients.length === 1 ? "" : "s"}`}
        </span>
        <div className="filters">
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

      {view === "people" && !isError && members && members.length > 0 && (
        <div className="clients">
          <div className="crow head" style={{ gridTemplateColumns: peopleColumns }}>
            <div>Name</div>
            <div>Email</div>
            {canSeeAccess && <div>Clients</div>}
            <div>Role</div>
            <div>Status</div>
            <div />
          </div>
          {members.map((m) => {
            const status = statusOf(m);
            const actions = actionsFor(m);
            return (
              <div
                className="crow"
                key={m.id}
                style={{ gridTemplateColumns: peopleColumns, cursor: "default" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <PersonAvatar
                    className="who"
                    style={{ width: 32, height: 32, fontSize: 12, background: avatarColour(m.user?.name ?? "?") }}
                    initials={initials(m.user?.name, m.user?.email ?? "?")}
                    photoUrl={m.user?.avatar_asset_id ? photos?.[m.user.avatar_asset_id] : null}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 500 }}>{m.user?.name ?? "—"}</div>
                    {m.user?.designation && (
                      <div style={{ fontSize: 13, color: "var(--muted)" }}>{m.user.designation}</div>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 14, color: "var(--muted)" }}>{m.user?.email ?? "—"}</div>
                {canSeeAccess && <div style={{ fontSize: 14 }}>{clientsCell(m)}</div>}
                <div>
                  <span className="tag blue">{ROLE_LABELS[m.role] ?? m.role}</span>
                  {m.role === "admin" && m.can_invite && (
                    <span className="tag" style={{ marginLeft: 6 }}>
                      Can invite
                    </span>
                  )}
                </div>
                <div>
                  <span className={`tag ${status.tone}`}>{status.label}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  {actions && (
                    <RowActionsMenu title={`Options for ${displayName(m)}`} items={actions} />
                  )}
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
            The Primary Owner, Owners and Admins see every client, so each client lists only the
            Users who&rsquo;ve been given access to it.
          </p>
          {activeClients.length === 0 ? (
            <div className="empty">
              <b>No clients yet</b>
            </div>
          ) : (
            <div className="clients">
              <div className="crow head" style={{ gridTemplateColumns: CLIENT_VIEW_COLUMNS }}>
                <div>Client</div>
                <div>Users with Access</div>
                <div className="ago">Users</div>
              </div>
              {activeClients.map((c) => {
                const withAccess = restrictedMembers
                  .filter((m) => grantsFor(m.id).includes(c.id))
                  .sort((a, b) => displayName(a).localeCompare(displayName(b)));
                return (
                  <div
                    className="crow"
                    key={c.id}
                    style={{ gridTemplateColumns: CLIENT_VIEW_COLUMNS, cursor: "default" }}
                  >
                    <div style={{ fontSize: 14.5, fontWeight: 500 }}>{c.name}</div>
                    <div style={{ fontSize: 14 }}>
                      {withAccess.length === 0 ? (
                        <span style={{ color: "var(--muted)" }}>No Users</span>
                      ) : (
                        withAccess
                          .map((m) => (m.accepted_at ? displayName(m) : `${displayName(m)} (invited)`))
                          .join(", ")
                      )}
                    </div>
                    <div className="ago">{withAccess.length}</div>
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
      {resent && (
        <div style={{ marginTop: 12, maxWidth: 560 }}>
          <InviteLinks sent={[resent]} />
        </div>
      )}

      {inviting && agency && (
        <InviteMemberModal
          agencyId={agency.agencyId}
          roles={inviteRoles}
          onClose={() => setInviting(false)}
          // The modal stays open on its links; the list notes it meanwhile.
          onSent={(email) => setNotice(`Invite sent to ${email}`)}
        />
      )}

      {editTarget && agency && (
        <EditMemberModal
          agencyId={agency.agencyId}
          membershipId={editTarget.id}
          name={displayName(editTarget)}
          role={editTarget.role as InvitableRole}
          roles={editRoles}
          currentClientIds={grantsFor(editTarget.id)}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setNotice(`${displayName(editTarget)} updated`);
            setEditTarget(null);
          }}
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
