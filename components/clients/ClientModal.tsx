"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useCreateClient } from "@/hooks/use-create-client";
import { useSaveClientLogo } from "@/hooks/use-client-logo";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { useTeamMembers } from "@/hooks/use-team-members";
import { useGiveNewClientTo } from "@/hooks/use-add-to-client";
import { ClientDetailsFields, ClientLogoCropper, useClientDraft } from "@/components/clients/ClientDetailsFields";
import { rolesICanInvite } from "@/lib/roles";
import { errorMessage } from "@/lib/errors";

function RemoveIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

// New Client: its details, and which of the team's Users get it (direct
// instruction: a dropdown of people already on Frank; this window doesn't
// invite anyone, that's Workspace Settings → Team only). Owners and
// Admins see every client already, so only Users are offered. A client's
// details are edited in place on its Client Profile (phase48).
export function ClientModal(props: { agencyId: string; activeClientCount: number; onClose: () => void }) {
  // The agency's plan limit (phase37), which the database enforces.
  const { data: agency } = useMyAgency();
  const clientLimit = agency?.clientLimit ?? null;
  // Giving a client to someone is for those who may add people
  // (add_person_to_client checks can_invite_people).
  const { data: me } = useMyMembership(props.agencyId);
  const canAdd = rolesICanInvite(me).length > 0;
  const { data: team } = useTeamMembers(canAdd ? props.agencyId : undefined);
  const users = (team ?? [])
    .filter((m) => m.role === "user" && !m.client_id && !m.removed_at && m.accepted_at)
    .map((m) => ({ userId: m.user_id, name: m.user?.name?.trim() || m.user?.email || "Someone", email: m.user?.email ?? "" }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const [picked, setPicked] = useState<string[]>([]);
  const [addErrors, setAddErrors] = useState<string[]>([]);
  const giveClient = useGiveNewClientTo(props.agencyId);
  const createClient = useCreateClient();
  const saveLogo = useSaveClientLogo();
  const draft = useClientDraft({ name: "", industry: null, description: null, logoAssetId: null });

  // Each picked User in turn, once the client exists. One that fails
  // doesn't undo the client or the others; it's said, and the window stays.
  async function giveToPicked(clientId: string) {
    const failed: string[] = [];
    for (const userId of picked) {
      try {
        await giveClient.mutateAsync({ clientId, userId });
      } catch (e) {
        const who = users.find((u) => u.userId === userId)?.name ?? "Someone";
        failed.push(`${who}: ${errorMessage(e, "Couldn't give them this client")}`);
      }
    }
    setAddErrors(failed);
    return failed.length === 0;
  }

  async function handleSubmit() {
    if (!draft.name.trim()) {
      draft.setNameError("Give the client a name.");
      return;
    }
    draft.setNameError(null);
    const created = await createClient.mutateAsync({
      agencyId: props.agencyId,
      name: draft.name.trim(),
      industry: draft.industry.trim(),
      description: draft.description,
    });
    if (draft.logoFile) {
      await saveLogo.mutateAsync({ agencyId: props.agencyId, clientId: created.id, file: draft.logoFile });
    }
    if (await giveToPicked(created.id)) props.onClose();
  }

  const isPending = createClient.isPending || saveLogo.isPending || giveClient.isPending;
  const submitError = createClient.error
    ? errorMessage(createClient.error, "Couldn't create the client")
    : saveLogo.error
      ? errorMessage(saveLogo.error, "Couldn't save the client's image")
      : null;
  const pickable = users.filter((u) => !picked.includes(u.userId));

  if (addErrors.length > 0) {
    return (
      <Modal
        hideCloseButton
        title="Client Created"
        onClose={props.onClose}
        footer={
          <button type="button" className="btn primary" onClick={props.onClose}>
            Done
          </button>
        }
      >
        <div className="note warn">
          <div>
            The client is saved, but {addErrors.length === 1 ? "this person wasn't" : "these people weren't"} given it:
            <ul className="confirm-list">
              {addErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            Add them from the client&rsquo;s People page.
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <>
    <Modal hideCloseButton
      title="New Client"
      onClose={props.onClose}
      footer={
        <>
          <span className="grow">
            {clientLimit === null
              ? `${props.activeClientCount} active client${props.activeClientCount === 1 ? "" : "s"}`
              : `${props.activeClientCount} of ${clientLimit} clients used`}
          </span>
          <button type="button" className="btn" onClick={props.onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={isPending} onClick={handleSubmit}>
            {isPending ? "Saving…" : "Create Client"}
          </button>
        </>
      }
    >
      <ClientDetailsFields draft={draft} />

      {canAdd && (
        <div className="field">
          <label htmlFor="ncTeam">
            Team <span className="hint">optional</span>
          </label>
          <div style={{ fontSize: 12.7, color: "var(--muted)", marginBottom: 8 }}>
            Users on your team who&rsquo;ll work on this client. Owners and Admins see every client already. To bring
            someone new onto Frank, invite them from Workspace Settings &rarr; Team.
          </div>
          {picked.map((id) => {
            const u = users.find((x) => x.userId === id);
            return (
              <div className="brow" key={id}>
                <div className="brow-h">
                  <span className="ncteam-who">
                    <b>{u?.name ?? "Someone"}</b> <span>{u?.email}</span>
                  </span>
                  <button
                    type="button"
                    className="brx"
                    title="Remove"
                    aria-label={`Remove ${u?.name ?? "them"}`}
                    onClick={() => setPicked((prev) => prev.filter((p) => p !== id))}
                  >
                    <RemoveIcon />
                  </button>
                </div>
              </div>
            );
          })}
          {users.length === 0 ? (
            <p className="note">No Users on your team yet. Invite them from Workspace Settings &rarr; Team.</p>
          ) : (
            pickable.length > 0 && (
              <select
                id="ncTeam"
                aria-label="Add someone from your team"
                value=""
                onChange={(e) => e.target.value && setPicked((prev) => [...prev, e.target.value])}
              >
                <option value="">Add someone from your team…</option>
                {pickable.map((u) => (
                  <option key={u.userId} value={u.userId}>
                    {u.name}
                  </option>
                ))}
              </select>
            )
          )}
        </div>
      )}

      {submitError && <p className="autherr">{submitError}</p>}
    </Modal>
    <ClientLogoCropper draft={draft} />
    </>
  );
}
