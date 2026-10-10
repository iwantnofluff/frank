"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { RowActionsMenu } from "@/components/ui/RowActionsMenu";
import { usePersonActions } from "@/components/team/PersonActions";
import { useUpdateProject } from "@/hooks/use-update-project";
import { useClientPeople, useSetProjectAccess } from "@/hooks/use-project-access";
import { useAvatarUrls } from "@/hooks/use-avatar-urls";
import type { ProjectListRow } from "@/hooks/use-projects";
import type { ProjectCreativeStats } from "@/hooks/use-project-creative-stats";
import { PROJECT_TYPE_OPTS } from "@/lib/project-types";
import { avatarColour } from "@/lib/avatar-colour";
import { initials } from "@/lib/initials";
import { errorMessage } from "@/lib/errors";
import { DeletePermanentlyDialog } from "@/components/ui/DeletePermanentlyDialog";
import { useMyMembership } from "@/hooks/use-my-membership";
import { useProjectTeam } from "@/hooks/use-project-discussion";
import { useProjectRoles, useSetProjectRole } from "@/hooks/use-project-roles";

const DELIVERY_LABELS = {
  scheduled: "Content Planner",
  continuous: "Other Content",
} as const;
const STAGES = ["Concept", "Internal Review", "Client Review", "Approved"];

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
  const [type, setType] = useState(project.type ?? "");
  const [dueOn, setDueOn] = useState(project.due_on ?? "");
  const [description, setDescription] = useState(project.description ?? "");
  const [nameError, setNameError] = useState<string | null>(null);

  // Delivery is fixed once a project is made (phase48), so only its own
  // types are offered.
  const options = PROJECT_TYPE_OPTS[project.delivery];
  const keepsUnlistedType = !!project.type && !options.includes(project.type);

  async function save() {
    if (!name.trim()) return setNameError("Give it a name first.");
    setNameError(null);
    await updateProject.mutateAsync({
      projectId: project.id,
      clientId,
      name,
      type: type || null,
      due_on: dueOn || null,
      description: description.trim() || null,
    });
    onClose();
  }

  return (
    <>
    <Modal
      hideCloseButton
      // Client, then project, as the review page reads. Projects have no
      // picture now, just their name (direct instruction).
      title={`${clientName} - ${project.name}`}
      ariaLabel={`${clientName} - ${project.name}`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onMoveToFolder}>
            Move to Folder
          </button>
          <button type="button" className="btn" onClick={onMoveToClient}>
            Move to Client
          </button>
          <button type="button" className="btn" onClick={onArchive}>
            {project.archived_at ? "Unarchive" : "Archive"}
          </button>
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
      <div className="profgrid">
        <div>
          <div className="msection-h">Details</div>
          <p className="msection-d">
            {isAdmin
              ? "What this project is and when it’s due."
              : "What this project is and when it’s due. Owners and Admins change these."}
          </p>
          {isAdmin ? (
            <>
              <div className="field">
                <label htmlFor="ppName">Project name</label>
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
              <div className="frow">
                <div className="field">
                  <label>Delivery</label>
                  <p className="profstatic" title="Fixed once a project is made">
                    {DELIVERY_LABELS[project.delivery]}
                  </p>
                </div>
                <div className="field">
                  <label htmlFor="ppType">Type</label>
                  <select id="ppType" value={type} onChange={(e) => setType(e.target.value)}>
                    {!type && <option value="">—</option>}
                    {keepsUnlistedType && <option value={project.type!}>{project.type}</option>}
                    {options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="ppDue">
                  Due date <span className="hint">optional</span>
                </label>
                <input id="ppDue" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
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
              <dt>Delivery</dt>
              <dd>{DELIVERY_LABELS[project.delivery]}</dd>
              <dt>Type</dt>
              <dd>{project.type || "—"}</dd>
              <dt>Due date</dt>
              <dd>{project.due_on ? formatDay(`${project.due_on}T00:00`) : "None set"}</dd>
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

          <ProjectPeople
            agencyId={agencyId}
            projectId={project.id}
            clientId={clientId}
            clientName={clientName}
            canManage={isAdmin}
          />
          <ProjectRoles projectId={project.id} canManage={isAdmin} />
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
  const setAccess = useSetProjectAccess();
  const actions = usePersonActions(agencyId, clientId);
  const { data: photos } = useAvatarUrls((people ?? []).map((p) => p.avatarAssetId));
  const on = (people ?? []).filter((p) => p.projectIds.includes(projectId));
  const off = (people ?? []).filter((p) => !p.projectIds.includes(projectId));

  return (
    <>
      <div className="msection-h">People</div>
      <p className="msection-d">
        {canManage
          ? "Users and Clients on this project. Owners and Admins see every project. Changes apply straight away."
          : "Owners and Admins choose who's on this project."}
      </p>
      {canManage &&
        (isPending ? (
          <p className="msection-d">Frank is working…</p>
        ) : error ? (
          <p className="autherr">{errorMessage(error, "Couldn't load who's on this project")}</p>
        ) : (
          <>
            {on.length === 0 && <p className="msection-empty">Nobody yet, besides Owners and Admins.</p>}
            <div className="proflist">
              {on.map((p) => (
                <div className="profperson" key={p.membershipId}>
                  <PersonAvatar
                    className="who"
                    style={{
                      width: 28,
                      height: 28,
                      fontSize: 11.2,
                      background: avatarColour(p.name),
                    }}
                    initials={initials(p.name, p.email)}
                    photoUrl={p.avatarAssetId ? photos?.[p.avatarAssetId] : null}
                    hasPhoto={!!p.avatarAssetId}
                  />
                  <div className="pp-t">
                    <b>{p.name}</b>
                    <span>{p.email}</span>
                  </div>
                  <span className="tag blue">{p.kind === "client" ? "Client" : "User"}</span>
                  {!p.accepted && <span className="tag grey">Invited</span>}
                  <RowActionsMenu title={`Options for ${p.name}`} items={actions.itemsFor(p)} />
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
              ))}
            </div>
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
            {setAccess.error && (
              <p className="autherr">{errorMessage(setAccess.error, "Couldn't change who's on this project")}</p>
            )}
          </>
        ))}
    </>
  );
}

// Each person's role on the project (phase85, direct instruction): Lead,
// Content, Designer… Blank shows nothing; filled in, it shows in brackets
// after their name in the table's Team column. The whole team is listed,
// Owners and Admins too, as they lead posts. Saved as each box is left.
function ProjectRoles({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const { data: team, isPending, error } = useProjectTeam(projectId, true);
  const { data: roles } = useProjectRoles(projectId);
  const setRole = useSetProjectRole(projectId);
  return (
    <>
      <div className="msection-h">Roles</div>
      <p className="msection-d">
        {canManage
          ? "What each person does on this project, shown after their name in the Team column. Leave blank for none."
          : "What each person does on this project. Owners and Admins set them."}
      </p>
      {isPending ? (
        <p className="msection-d">Frank is working…</p>
      ) : error ? (
        <p className="autherr">{errorMessage(error, "Couldn't load the project's team")}</p>
      ) : (
        <div className="profroles">
          {(team ?? []).map((m) => (
            <label className="profrole" key={m.user_id}>
              <span>{m.name}</span>
              <input
                className="bin one"
                // Keyed by the saved role, so a save elsewhere shows here.
                key={roles?.[m.user_id] ?? ""}
                defaultValue={roles?.[m.user_id] ?? ""}
                placeholder="Role, e.g. Designer"
                maxLength={40}
                disabled={!canManage}
                aria-label={`${m.name}'s role`}
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  if (value !== (roles?.[m.user_id] ?? "")) setRole.mutate({ userId: m.user_id, role: value });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
            </label>
          ))}
        </div>
      )}
      {setRole.isSuccess && !setRole.isPending && <p className="msection-d" role="status">Saved.</p>}
      {setRole.error && <p className="autherr">{errorMessage(setRole.error, "Couldn't save the role")}</p>}
    </>
  );
}
