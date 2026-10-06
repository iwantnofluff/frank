"use client";

import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { ProjectPicker } from "@/components/team/ProjectPicker";
import { usePersonActions } from "@/components/team/PersonActions";
import { RowActionsMenu } from "@/components/ui/RowActionsMenu";
import { useClientPeople, useSetPersonProjects, type ClientPerson } from "@/hooks/use-project-access";
import { useAvatarUrls } from "@/hooks/use-avatar-urls";
import { useUpdateClient } from "@/hooks/use-update-client";
import { useSaveClientLogo } from "@/hooks/use-client-logo";
import { ClientDetailsFields, ClientLogoCropper, useClientDraft } from "@/components/clients/ClientDetailsFields";
import type { ClientRow } from "@/hooks/use-clients";
import { avatarColour } from "@/lib/avatar-colour";
import { initials } from "@/lib/initials";
import { errorMessage } from "@/lib/errors";

// A client's People and its details editor (phase46, phase48), shared by
// Client Settings' People and Client Details pages (direct instruction:
// they replace the Client Profile window). Who's on which project changes
// straight away; Owners and Admins edit the details in place.
export function ClientPeople({
  agencyId,
  clientId,
  clientName,
  groups,
  canManage,
  canInvite,
  onInvite,
}: {
  agencyId: string;
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
  const actions = usePersonActions(agencyId, clientId);

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
                        style={{ width: 28, height: 28, fontSize: 11.2, background: avatarColour(p.name) }}
                        initials={initials(p.name, p.email)}
                        photoUrl={p.avatarAssetId ? photos?.[p.avatarAssetId] : null}
                      />
                      <div className="pp-t">
                        <b>{p.name}</b>
                        <span>{p.email}</span>
                      </div>
                      <span className="tag blue">{p.kind === "client" ? "Client" : "User"}</span>
                      {!p.accepted && <span className="tag grey">Invited</span>}
                      <RowActionsMenu title={`Options for ${p.name}`} items={actions.itemsFor(p)} />
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
            {actions.outcome}
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
export function ClientDetailsEditor({
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
