"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { useUpdateProject } from "@/hooks/use-update-project";
import { useClientPeople, useSetProjectAccess } from "@/hooks/use-project-access";
import { useAvatarUrls } from "@/hooks/use-avatar-urls";
import type { ProjectListRow } from "@/hooks/use-projects";
import type { ProjectCreativeStats } from "@/hooks/use-project-creative-stats";
import { PROJECT_TYPE_OPTS } from "@/lib/project-types";
import { avatarColour } from "@/lib/avatar-colour";
import { initials } from "@/lib/initials";
import { errorMessage } from "@/lib/errors";

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
  onMoveToFolder,
  onMoveToClient,
  onArchive,
  onClose,
}: {
  project: ProjectListRow;
  clientId: string;
  clientName: string;
  stats: ProjectCreativeStats | undefined;
  // Owners and Admins: they change the details (projects_details_admin_only)
  // and the people (project_access policies).
  isAdmin: boolean;
  onMoveToFolder: () => void;
  onMoveToClient: () => void;
  onArchive: () => void;
  onClose: () => void;
}) {
  const updateProject = useUpdateProject();
  const [name, setName] = useState(project.name);
  const [type, setType] = useState(project.type ?? "");
  const [delivery, setDelivery] = useState(project.delivery);
  const [dueOn, setDueOn] = useState(project.due_on ?? "");
  const [description, setDescription] = useState(project.description ?? "");
  const [nameError, setNameError] = useState<string | null>(null);

  const options = PROJECT_TYPE_OPTS[delivery];
  const keepsUnlistedType = !!project.type && project.delivery === delivery && !options.includes(project.type);
  // The database refuses a delivery change once there are posts.
  const hasPosts = (stats?.total ?? 0) > 0;

  function changeDelivery(next: "scheduled" | "continuous") {
    setDelivery(next);
    setType(next === project.delivery ? (project.type ?? "") : PROJECT_TYPE_OPTS[next][0]);
  }

  async function save() {
    if (!name.trim()) return setNameError("Give it a name first.");
    setNameError(null);
    await updateProject.mutateAsync({
      projectId: project.id,
      clientId,
      name,
      type: type || null,
      delivery: delivery === project.delivery ? undefined : delivery,
      due_on: dueOn || null,
      description: description.trim() || null,
    });
    onClose();
  }

  return (
    <Modal
      hideCloseButton
      title={project.name}
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
                  <label htmlFor="ppDelivery">Delivery</label>
                  <select
                    id="ppDelivery"
                    value={delivery}
                    disabled={hasPosts}
                    onChange={(e) => changeDelivery(e.target.value as "scheduled" | "continuous")}
                  >
                    <option value="scheduled">{DELIVERY_LABELS.scheduled}</option>
                    <option value="continuous">{DELIVERY_LABELS.continuous}</option>
                  </select>
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
              {hasPosts && (
                <p className="msection-d" style={{ marginTop: -4 }}>
                  Delivery can&rsquo;t change once a project has posts.
                </p>
              )}
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

          <ProjectPeople projectId={project.id} clientId={clientId} clientName={clientName} canManage={isAdmin} />
        </div>
      </div>
    </Modal>
  );
}

function ProjectPeople({
  projectId,
  clientId,
  clientName,
  canManage,
}: {
  projectId: string;
  clientId: string;
  clientName: string;
  canManage: boolean;
}) {
  const { data: people, isPending, error } = useClientPeople(clientId, canManage);
  const setAccess = useSetProjectAccess();
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
          <p className="msection-d">Loading…</p>
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
                      fontSize: 11,
                      background: avatarColour(p.name),
                    }}
                    initials={initials(p.name, p.email)}
                    photoUrl={p.avatarAssetId ? photos?.[p.avatarAssetId] : null}
                  />
                  <div className="pp-t">
                    <b>{p.name}</b>
                    <span>{p.email}</span>
                  </div>
                  <span className="tag blue">{p.kind === "client" ? "Client" : "User"}</span>
                  {!p.accepted && <span className="tag grey">Invited</span>}
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
            {setAccess.error && (
              <p className="autherr">{errorMessage(setAccess.error, "Couldn't change who's on this project")}</p>
            )}
          </>
        ))}
    </>
  );
}
