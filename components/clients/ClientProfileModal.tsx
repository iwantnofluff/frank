"use client";

import { useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { ProjectPicker } from "@/components/team/ProjectPicker";
import { useProjects } from "@/hooks/use-projects";
import { useProjectCreativeStats } from "@/hooks/use-project-creative-stats";
import { useClientPeople, useSetPersonProjects, type ClientPerson } from "@/hooks/use-project-access";
import { useAvatarUrls } from "@/hooks/use-avatar-urls";
import { useUpdateClient } from "@/hooks/use-update-client";
import { useSaveClientLogo } from "@/hooks/use-client-logo";
import { ClientDetailsFields, ClientLogoCropper, useClientDraft } from "@/components/clients/ClientDetailsFields";
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
// Owners and Admins edit the details in place (phase48) and change people's
// projects straight away; a User sees both read-only.
export function ClientProfileModal({
  agencyId,
  client,
  isAdmin,
  canInvite,
  onInvite,
  onArchive,
  onClose,
}: {
  agencyId: string;
  client: ClientRow;
  // Owners and Admins: they change the details (clients_details_admin_only)
  // and people's projects (project_access policies).
  isAdmin: boolean;
  canInvite: boolean;
  onInvite: () => void;
  onArchive: () => void;
  onClose: () => void;
}) {
  const { data: projects } = useProjects(client.id);
  const { data: stats } = useProjectCreativeStats(client.id);
  const live = (projects ?? []).filter((p) => !p.archived_at);
  const { data: logoUrls } = useAvatarUrls([client.logo_asset_id]);
  const logoUrl = client.logo_asset_id ? (logoUrls?.[client.logo_asset_id] ?? null) : null;
  const [editing, setEditing] = useState(false);
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
          <div className="msection-h profhead">
            Details
            {isAdmin && !editing && (
              <button type="button" className="badd" onClick={() => setEditing(true)}>
                Edit
              </button>
            )}
          </div>
          {editing ? (
            <ClientDetailsEditor agencyId={agencyId} client={client} onDone={() => setEditing(false)} />
          ) : (
            <>
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
            </>
          )}

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
            {projects ? `${live.length} live project${live.length === 1 ? "" : "s"}.` : "Loading…"}
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
                  <span className="profcount">{s ? `${s.done} of ${s.total} approved` : "…"}</span>
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
            canManage={isAdmin}
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

// The details as fields, saved in place.
function ClientDetailsEditor({
  agencyId,
  client,
  onDone,
}: {
  agencyId: string;
  client: ClientRow;
  onDone: () => void;
}) {
  const draft = useClientDraft({
    name: client.name,
    industry: client.industry,
    description: client.description,
    logoAssetId: client.logo_asset_id,
  });
  const updateClient = useUpdateClient();
  const saveLogo = useSaveClientLogo();
  const pending = updateClient.isPending || saveLogo.isPending;
  const error = updateClient.error ?? saveLogo.error;

  async function save() {
    if (!draft.name.trim()) return draft.setNameError("Give the client a name.");
    await updateClient.mutateAsync({
      clientId: client.id,
      name: draft.name,
      industry: draft.industry,
      description: draft.description,
    });
    if (draft.logoFile) await saveLogo.mutateAsync({ agencyId, clientId: client.id, file: draft.logoFile });
    else if (draft.logoRemoved) await saveLogo.mutateAsync({ agencyId, clientId: client.id, file: null });
    onDone();
  }

  return (
    <>
      <ClientDetailsFields draft={draft} />
      {error && <p className="autherr">{errorMessage(error, "Couldn't save the client")}</p>}
      <div className="profactions">
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button type="button" className="btn primary" disabled={pending} onClick={() => save().catch(() => {})}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      <ClientLogoCropper draft={draft} />
    </>
  );
}
