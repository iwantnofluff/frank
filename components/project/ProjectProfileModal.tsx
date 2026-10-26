"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { usePersonActions } from "@/components/team/PersonActions";
import { useUpdateProject } from "@/hooks/use-update-project";
import { useClientPeople, useSetProjectAccess } from "@/hooks/use-project-access";
import { PersonTypeMenu } from "@/components/clients/PersonTypeMenu";
import { useProject } from "@/hooks/use-project";
import { useSetPostTeamDefault } from "@/hooks/use-set-post-team-default";
import { useAvatarUrls } from "@/hooks/use-avatar-urls";
import type { ProjectListRow } from "@/hooks/use-projects";
import type { ProjectCreativeStats } from "@/hooks/use-project-creative-stats";
import { avatarColour } from "@/lib/avatar-colour";
import { initials } from "@/lib/initials";
import { errorMessage } from "@/lib/errors";
import { DeletePermanentlyDialog } from "@/components/ui/DeletePermanentlyDialog";
import { useMyMembership } from "@/hooks/use-my-membership";
import { useProjectRoles, useSetProjectRole } from "@/hooks/use-project-roles";
import { ProjectStatuses } from "@/components/project/ProjectStatuses";
import { useTeamMembers } from "@/hooks/use-team-members";
import { ROLE_LABELS, seesAllClients } from "@/lib/roles";

const STAGES = ["Concept", "In Production", "Internal Review", "Client Review", "Approved", "Live"];

function formatDay(value: string | null) {
  if (!value) return "None yet";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// A project at a glance (phase46), opened from its row's expand button: its
// details, how its posts are getting on, who's on it, and the row's other
// actions. Owners and Admins edit the details (saved together) and the
// people (straight away); a User sees both read-only (phase47).
export function ProjectProfileModal({
  project,
  clientId,
  clientName,
  stats,
  isAdmin,
  agencyId,
  onMoveToFolder,
  onMoveToClient,
  onArchive,
  onClose,
  onDeleted = onClose,
}: {
  project: ProjectListRow;
  clientId: string;
  clientName: string;
  stats: ProjectCreativeStats | undefined;
  // Owners and Admins: they change the details (projects_details_admin_only)
  // and the people (project_access policies).
  isAdmin: boolean;
  agencyId: string;
  onMoveToFolder: () => void;
  onMoveToClient: () => void;
  onArchive: () => void;
  onClose: () => void;
  // Gone for good: by default, just closed.
  onDeleted?: () => void;
}) {
  const updateProject = useUpdateProject();
  // Owners and the Primary Owner delete an archived project for good (phase74).
  const { data: me } = useMyMembership(agencyId);
  const isOwner = !!me && !me.client_id && (me.role === "owner" || me.role === "primary_owner");
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [nameError, setNameError] = useState<string | null>(null);


  async function save() {
    if (!name.trim()) return setNameError("Give it a name first.");
    setNameError(null);
    await updateProject.mutateAsync({
      projectId: project.id,
      clientId,
      name,
      // Type isn't changed here (direct instruction), so it isn't sent:
      // a save never puts back what it was when the window opened. Nor
      // the Due Date, no longer shown here (direct instruction).
      description: description.trim() || null,
    });
    onClose();
  }

  return (
    <>
    <Modal
      hideCloseButton
      // "Client | Project Name Settings" (direct instruction), the rule
      // as in the project's own title.
      title={
        <>
          {clientName}
          <span className="h1sep sm"> — </span>
          {project.name} Settings
        </>
      }
      ariaLabel={`${clientName} — ${project.name} Settings`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onMoveToFolder}>
            Move to Folder
          </button>
          {/* Owners and Admins only (phase95). */}
          {isAdmin && (
            <button type="button" className="btn" onClick={onMoveToClient}>
              Move to Client
            </button>
          )}
          {/* Owners and Admins only (phase94). */}
          {isAdmin && (
            <button type="button" className="btn" onClick={onArchive}>
              {project.archived_at ? "Unarchive" : "Archive"}
            </button>
          )}
          {project.archived_at && isOwner && (
            <button type="button" className="btn danger" onClick={() => setDeleting(true)}>
              Delete Permanently
            </button>
          )}
          <span className="grow" />
          {isAdmin ? (
            <>
              <button type="button" className="btn" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={updateProject.isPending}
                onClick={() => save().catch(() => {})}
              >
                {updateProject.isPending ? "Saving…" : "Save"}
              </button>
            </>
          ) : (
            <button type="button" className="btn primary" onClick={onClose}>
              Done
            </button>
          )}
        </>
      }
    >
      {/* One column, a quarter narrower than the two-column layout it
          replaced (direct instruction), a line between its sections. */}
      <div className="profgrid single">
        <div>
          <div className="msection-h">Details</div>
          <p className="msection-d">
            {isAdmin
              ? "What this project is."
              : "What this project is. Owners and Admins change these."}
          </p>
          {isAdmin ? (
            <>
              {/* Project Name and Description (direct instruction: no
                  Delivery or Due Date). Type isn't changed here; it's
                  chosen when a project is made. */}
              <div className="field">
                <label htmlFor="ppName">Project Name</label>
                <input
                  id="ppName"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (nameError) setNameError(null);
                  }}
                />
                {nameError && <p className="autherr">{nameError}</p>}
              </div>
              <div className="field">
                <label htmlFor="ppDesc">
                  Description <span className="hint">optional, {description.length}/1000</span>
                </label>
                <textarea
                  id="ppDesc"
                  rows={4}
                  maxLength={1000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What this project covers, and anything the team should know"
                />
              </div>
              {updateProject.error && (
                <p className="autherr">{errorMessage(updateProject.error, "Couldn't save the project")}</p>
              )}
            </>
          ) : (
            <dl className="profdl">
              <dt>Description</dt>
              <dd className="profdesc">{project.description || "No description yet."}</dd>
            </dl>
          )}
        </div>

        <div>
          <div className="msection-h">Progress</div>
          <p className="msection-d">Live posts by stage.</p>
          <div className="stats profstats">
            {STAGES.map((label, i) => (
              <div className="stat" key={label}>
                <div className="n">{stats ? stats.byStage[i] : "…"}</div>
                <div className="l">{label}</div>
              </div>
            ))}
          </div>
          <p className="profline">
            Latest approval: <b>{formatDay(stats?.latestApprovedAt ?? null)}</b>
          </p>
        </div>

        {/* The steps within In Production and Internal Review (phase123). */}
        <div>
          <ProjectStatuses projectId={project.id} canManage={isAdmin} />
        </div>

        {/* Its own part, so its line above is spaced as Progress's is
            (direct instruction). */}
        <div>
          <ProjectPeople
            agencyId={agencyId}
            projectId={project.id}
            clientId={clientId}
            clientName={clientName}
            canManage={isAdmin}
          />
        </div>
      </div>
    </Modal>
    {deleting && (
      <DeletePermanentlyDialog
        kind="project"
        id={project.id}
        name={project.name}
        onClose={() => setDeleting(false)}
        onDeleted={onDeleted}
      />
    )}
    </>
  );
}

function ProjectPeople({
  agencyId,
  projectId,
  clientId,
  clientName,
  canManage,
}: {
  agencyId: string;
  projectId: string;
  clientId: string;
  clientName: string;
  canManage: boolean;
}) {
  const { data: people, isPending, error } = useClientPeople(clientId, canManage);
  // Owners and Admins are on every project without being added, so they're
  // listed too (direct instruction), first, and can't be taken off.
  const { data: team } = useTeamMembers(agencyId || undefined);
  const leaders = (team ?? []).filter((m) => seesAllClients(m.role) && m.accepted_at && !m.removed_at && m.user);
  const setAccess = useSetProjectAccess();
  const actions = usePersonActions(agencyId, clientId);
  // Ticked: on every new post's Team to start with (phase101, direct
  // instruction). Owners and Admins choose; the team, not clients.
  const { data: project } = useProject(projectId);
  const defaults = project?.default_team_user_ids ?? [];
  const setDefault = useSetPostTeamDefault(projectId);
  const postDefault = (userId: string, name: string) => (
    <input
      type="checkbox"
      aria-label={`Post default for ${name}`}
      title={`${name} on every new post's Team`}
      checked={defaults.includes(userId)}
      disabled={!canManage || setDefault.isPending || !project}
      onChange={(e) => setDefault.mutate({ current: defaults, userId, on: e.target.checked })}
    />
  );
  const { data: photos } = useAvatarUrls([
    ...(people ?? []).map((p) => p.avatarAssetId),
    ...leaders.map((m) => m.user!.avatar_asset_id),
  ]);
  const on = (people ?? []).filter((p) => p.projectIds.includes(projectId));
  const off = (people ?? []).filter((p) => !p.projectIds.includes(projectId));
  // Invited goes after the name, on its line (direct instruction).
  const nameCell = (name: string, email: string, asset: string | null, invited = false) => (
    <div className="pt-name" role="cell">
      <PersonAvatar
        className="who"
        style={{ width: 28, height: 28, fontSize: 11.2, background: avatarColour(name) }}
        initials={initials(name, email)}
        photoUrl={asset ? photos?.[asset] : null}
        hasPhoto={!!asset}
      />
      <div className="pp-t">
        <b>
          {name}
          {invited && <span className="tag grey">Invited</span>}
        </b>
        <span>{email}</span>
      </div>
    </div>
  );
  const shown = canManage && !isPending && !error;
  // Each person's role on the project (phase85), a column of its own now
  // (direct instruction): Lead, Content, Designer… The team's, not
  // clients'. Saved as each box is left.
  const { data: roles } = useProjectRoles(projectId);
  const setRole = useSetProjectRole(projectId);
  const projectRole = (userId: string, name: string) =>
    !canManage ? (
      <span className="pt-prole">{roles?.[userId] || "—"}</span>
    ) : (
      <input
        className="bin one pt-prole-in"
        // Keyed by the saved role, so a save elsewhere shows here.
        key={roles?.[userId] ?? ""}
        defaultValue={roles?.[userId] ?? ""}
        placeholder="e.g. Designer"
        maxLength={40}
        aria-label={`${name}'s project role`}
        onBlur={(e) => {
          const value = e.target.value.trim();
          if (value !== (roles?.[userId] ?? "")) setRole.mutate({ userId, role: value });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    );

  return (
    <>
      <div className="msection-h">People</div>
      <p className="msection-d">
        {canManage
          ? "Everyone on this project. Owners and Admins are on every project; add Users and Clients here. A Project Role shows after the person's name in the table's Team column. Tick Post Default for whoever should be on every new post's Team. Changes apply straight away."
          : "Everyone on this project. Owners and Admins choose who's on it."}
      </p>
      {/* A table (direct instruction): its name, role (a dropdown for a User
          or Client, as everywhere people are listed), and Post Default. */}
      <div className="proftable" role="table" aria-label="People on this project">
        <div className="pt-row pt-head" role="row">
          <span role="columnheader">Name</span>
          <span role="columnheader">Workspace Role</span>
          <span role="columnheader">Project Role</span>
          <span role="columnheader">Post Default</span>
          <span role="columnheader" aria-label="Remove" />
        </div>
        {leaders.map((m) => (
          <div className="pt-row" role="row" key={m.id}>
            {nameCell(m.user!.name, m.user!.email, m.user!.avatar_asset_id)}
            <div className="pt-role" role="cell">
              <span className="tag blue">{ROLE_LABELS[m.role]}</span>
            </div>
            <div role="cell">{projectRole(m.user_id, m.user!.name)}</div>
            <div className="pt-def" role="cell">
              {postDefault(m.user_id, m.user!.name)}
            </div>
            <div role="cell" />
          </div>
        ))}
        {shown &&
          on.map((p) => (
            <div className="pt-row" role="row" key={p.membershipId}>
              {nameCell(p.name, p.email, p.avatarAssetId, !p.accepted)}
              <div className="pt-role" role="cell">
                <PersonTypeMenu
                  person={p}
                  disabled={actions.switching}
                  onSwitch={(to) => actions.switchType(p, to)}
                  extra={actions.inviteItems(p)}
                />
              </div>
              <div role="cell">{p.kind === "user" && projectRole(p.userId, p.name)}</div>
              <div className="pt-def" role="cell">
                {p.kind === "user" && postDefault(p.userId, p.name)}
              </div>
              <div role="cell">
                <button
                  type="button"
                  className="brx"
                  title={`Take ${p.name} off this project`}
                  disabled={setAccess.isPending}
                  onClick={() =>
                    setAccess.mutate({
                      membershipId: p.membershipId,
                      projectId,
                      clientId,
                      on: false,
                    })
                  }
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
      </div>
      {canManage &&
        (isPending ? (
          <p className="msection-d">Frank is working…</p>
        ) : error ? (
          <p className="autherr">{errorMessage(error, "Couldn't load who's on this project")}</p>
        ) : (
          <>
            {on.length === 0 && <p className="msection-empty">No Users or Clients yet.</p>}
            {off.length > 0 ? (
              <select
                aria-label="Add someone to this project"
                value=""
                disabled={setAccess.isPending}
                onChange={(e) => {
                  if (e.target.value)
                    setAccess.mutate({
                      membershipId: e.target.value,
                      projectId,
                      clientId,
                      on: true,
                    });
                }}
              >
                <option value="">+ Add someone from {clientName}</option>
                {off.map((p) => (
                  <option key={p.membershipId} value={p.membershipId}>
                    {p.name} ({p.kind === "client" ? "Client" : "User"})
                  </option>
                ))}
              </select>
            ) : (
              (people ?? []).length === 0 && (
                <p className="msection-d">Invite Users or Clients to {clientName} from Edit Client to add them here.</p>
              )
            )}
            {actions.outcome}
            {setRole.isSuccess && !setRole.isPending && (
              <p className="msection-d" role="status">
                Saved.
              </p>
            )}
            {setRole.error && <p className="autherr">{errorMessage(setRole.error, "Couldn't save the role")}</p>}
            {setAccess.error && (
              <p className="autherr">{errorMessage(setAccess.error, "Couldn't change who's on this project")}</p>
            )}
          </>
        ))}
    </>
  );
}

