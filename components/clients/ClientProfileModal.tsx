"use client";

import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { ProjectPicker } from "@/components/team/ProjectPicker";
import { useProjects } from "@/hooks/use-projects";
import { useProjectCreativeStats } from "@/hooks/use-project-creative-stats";
import { useClientPeople, useSetPersonProjects, type ClientPerson } from "@/hooks/use-project-access";
import { useAvatarUrls } from "@/hooks/use-avatar-urls";
import type { ClientRow } from "@/hooks/use-clients";
import { avatarColour } from "@/lib/avatar-colour";
import { initials } from "@/lib/initials";
import { errorMessage } from "@/lib/errors";

const STAGES = ["Concept", "Internal Review", "Client Review", "Approved"];

function formatDay(value: string | null) {
  if (!value) return "None yet";
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// A client at a glance (phase46), opened from its row's expand button: its
// details, how its work is getting on, its projects, and who's on which.
// Details are edited in Edit Client; people's projects change straight away.
export function ClientProfileModal({
  client,
  logoUrl,
  canManagePeople,
  canInvite,
  onEdit,
  onInvite,
  onArchive,
  onClose,
}: {
  client: ClientRow;
  logoUrl: string | null;
  // Owners and Admins (project_access policies).
  canManagePeople: boolean;
  canInvite: boolean;
  onEdit: () => void;
  onInvite: () => void;
  onArchive: () => void;
  onClose: () => void;
}) {
  const { data: projects } = useProjects(client.id);
  const { data: stats } = useProjectCreativeStats(client.id);
  const live = (projects ?? []).filter((p) => !p.archived_at);
  const byStage = STAGES.map((_, i) => Object.values(stats ?? {}).reduce((n, s) => n + s.byStage[i], 0));
  const latest = Object.values(stats ?? {}).reduce<string | null>(
    (best, s) => (s.latestApprovedAt && (!best || s.latestApprovedAt > best) ? s.latestApprovedAt : best),
    null,
  );

  return (
    <Modal
      hideCloseButton
      title={client.name}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onEdit}>
            Edit Client
          </button>
          <button type="button" className="btn" onClick={onArchive}>
            {client.archived_at ? "Unarchive" : "Archive"}
          </button>
          <span className="grow" />
          <button type="button" className="btn primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <div className="profgrid">
        <div>
          <div className="msection-h">Details</div>
          <div className="profclient">
            <div className="logo" style={{ background: client.accent_colour || "#6B7280" }}>
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
                <img src={logoUrl} alt="" />
              ) : (
                initials(client.name, "?")
              )}
            </div>
            <div className="pp-t">
              <b>{client.name}</b>
              <span>{client.industry || "No industry set"}</span>
            </div>
          </div>
          <p className="profdesc">{client.description || "No description yet."}</p>

          <div className="msection-h">Progress</div>
          <p className="msection-d">Live posts by stage, across its projects.</p>
          <div className="stats profstats">
            {STAGES.map((label, i) => (
              <div className="stat" key={label}>
                <div className="n">{stats ? byStage[i] : "…"}</div>
                <div className="l">{label}</div>
              </div>
            ))}
          </div>
          <p className="profline">
            Latest approval: <b>{formatDay(latest)}</b>
          </p>

          <div className="msection-h">Projects</div>
          <p className="msection-d">
            {live.length} live project{live.length === 1 ? "" : "s"}.
          </p>
          <div className="proflist">
            {live.map((p) => {
              const s = stats?.[p.id];
              return (
                <Link className="profperson profproject" href={`/projects/${p.id}`} key={p.id} onClick={onClose}>
                  <div className="pp-t">
                    <b>{p.name}</b>
                    <span>{p.type || (p.delivery === "scheduled" ? "Content Planner" : "Other Content")}</span>
                  </div>
                  <span className="profcount">
                    {s ? `${s.done} of ${s.total} approved` : "…"}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        <div>
          <ClientPeople
            clientId={client.id}
            clientName={client.name}
            groups={[{ name: "Projects", projects: live }]}
            canManage={canManagePeople}
            canInvite={canInvite}
            onInvite={onInvite}
          />
        </div>
      </div>
    </Modal>
  );
}

function ClientPeople({
  clientId,
  clientName,
  groups,
  canManage,
  canInvite,
  onInvite,
}: {
  clientId: string;
  clientName: string;
  groups: { name: string; projects: { id: string; name: string }[] }[];
  canManage: boolean;
  canInvite: boolean;
  onInvite: () => void;
}) {
  const { data: people, isPending, error } = useClientPeople(clientId, canManage);
  const setProjects = useSetPersonProjects();
  const { data: photos } = useAvatarUrls((people ?? []).map((p) => p.avatarAssetId));
  const liveIds = groups[0].projects.map((p) => p.id);

  // Only live projects are offered; archived ones they're on stay as they are.
  function change(p: ClientPerson, next: string[] | null) {
    const from = p.projectIds.filter((id) => liveIds.includes(id));
    setProjects.mutate({ membershipId: p.membershipId, clientId, from, to: next ?? liveIds });
  }

  return (
    <>
      <div className="msection-h">People</div>
      <p className="msection-d">
        {canManage
          ? `Users and Clients on ${clientName}, and their projects. Owners and Admins see everything. Changes apply straight away.`
          : "Owners and Admins choose who's on each project."}
      </p>
      {canManage &&
        (isPending ? (
          <p className="msection-d">Loading…</p>
        ) : error ? (
          <p className="autherr">{errorMessage(error, "Couldn't load who's on this client")}</p>
        ) : (
          <>
            {(people ?? []).length === 0 && <p className="msection-empty">No Users or Clients yet.</p>}
            <div className="proflist">
              {(people ?? []).map((p) => {
                const on = p.projectIds.filter((id) => liveIds.includes(id));
                return (
                  <div className="profperson stack" key={p.membershipId}>
                    <div className="pp-top">
                      <PersonAvatar
                        className="who"
                        style={{ width: 28, height: 28, fontSize: 11, background: avatarColour(p.name) }}
                        initials={initials(p.name, p.email)}
                        photoUrl={p.avatarAssetId ? photos?.[p.avatarAssetId] : null}
                      />
                      <div className="pp-t">
                        <b>{p.name}</b>
                        <span>{p.email}</span>
                      </div>
                      <span className="tag blue">{p.kind === "client" ? "Client" : "User"}</span>
                      {!p.accepted && <span className="tag grey">Invited</span>}
                    </div>
                    {liveIds.length > 0 && (
                      <div className="pp-proj">
                        <ProjectPicker
                          groups={groups}
                          value={on.length === liveIds.length ? null : on}
                          onChange={(next) => change(p, next)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {setProjects.error && (
              <p className="autherr">{errorMessage(setProjects.error, "Couldn't change their projects")}</p>
            )}
          </>
        ))}
      {canInvite && (
        <button type="button" className="badd" onClick={onInvite}>
          + Invite People
        </button>
      )}
    </>
  );
}
