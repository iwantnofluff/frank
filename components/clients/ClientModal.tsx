"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useCreateClient } from "@/hooks/use-create-client";
import { useSaveClientLogo } from "@/hooks/use-client-logo";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { useTeamMembers } from "@/hooks/use-team-members";
import { useInviteMember, type SentInvite } from "@/hooks/use-invite-member";
import { InviteLinks } from "@/components/team/InviteLinks";
import { ClientDetailsFields, ClientLogoCropper, useClientDraft } from "@/components/clients/ClientDetailsFields";
import { INVITE_ROLE_LABELS, rolesICanInvite, type InviteRole } from "@/lib/roles";
import { errorMessage } from "@/lib/errors";

function RemoveIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

// Someone to invite to this client (phase44).
interface InviteDraft {
  firstName: string;
  lastName: string;
  email: string;
  role: InviteRole;
}

// New Client: its details, and people to invite as it's made. A client's
// details are edited in place on its Client Profile (phase48).
export function ClientModal(props: { agencyId: string; activeClientCount: number; onClose: () => void }) {
  // The agency's plan limit (phase37), which the database enforces.
  const { data: agency } = useMyAgency();
  const clientLimit = agency?.clientLimit ?? null;
  // Inviting people to this client as it's saved (decided directly, phase44):
  // only the roles this person may give, and the plan's team places.
  const { data: me } = useMyMembership(props.agencyId);
  const inviteRoles = rolesICanInvite(me);
  const { data: team } = useTeamMembers(inviteRoles.length ? props.agencyId : undefined);
  const placesLeft =
    agency?.seatLimit == null ? null : Math.max(0, agency.seatLimit - (team ?? []).filter((m) => !m.removed_at).length);
  const inviteMember = useInviteMember();
  const [invites, setInvites] = useState<InviteDraft[]>([]);
  const [sent, setSent] = useState<SentInvite[] | null>(null);
  const [inviteErrors, setInviteErrors] = useState<string[]>([]);
  const createClient = useCreateClient();
  const saveLogo = useSaveClientLogo();
  const draft = useClientDraft({ name: "", industry: null, description: null, logoAssetId: null });

  function updateInvite(i: number, patch: Partial<InviteDraft>) {
    setInvites((prev) => prev.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  }

  // Each person in turn, once the client exists. A failed invite doesn't
  // undo the client or the others; it's listed with the links.
  async function sendInvites(clientId: string) {
    const ready = invites.filter((v) => v.email.trim());
    if (!ready.length) return false;
    const done: SentInvite[] = [];
    const failed: string[] = [];
    for (const v of ready) {
      try {
        done.push(
          await inviteMember.mutateAsync({
            agencyId: props.agencyId,
            email: v.email.trim(),
            firstName: v.firstName.trim(),
            lastName: v.lastName.trim(),
            role: v.role,
            // A User gets this client; a Client is from it; Owners and
            // Admins see every client already.
            clientIds: v.role === "user" || v.role === "client" ? [clientId] : [],
          }),
        );
      } catch (e) {
        failed.push(`${v.email.trim()}: ${errorMessage(e, "Couldn't send the invite")}`);
      }
    }
    setSent(done);
    setInviteErrors(failed);
    return true;
  }

  async function handleSubmit() {
    if (!draft.name.trim()) {
      draft.setNameError("Give the client a name.");
      return;
    }
    const incomplete = invites.find((v) => v.email.trim() && (!v.firstName.trim() || !v.lastName.trim()));
    if (incomplete) {
      draft.setNameError(`Give ${incomplete.email.trim()} a first and last name, or remove them.`);
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
    // With invites, stay open on their links; otherwise done.
    if (!(await sendInvites(created.id))) props.onClose();
  }

  const isPending = createClient.isPending || saveLogo.isPending || inviteMember.isPending;
  const submitError = createClient.error
    ? errorMessage(createClient.error, "Couldn't create the client")
    : saveLogo.error
      ? errorMessage(saveLogo.error, "Couldn't save the client's image")
      : null;

  if (sent) {
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
        {sent.length > 0 && <InviteLinks sent={sent} />}
        {inviteErrors.length > 0 && (
          <div className="note warn" style={{ marginTop: 12 }}>
            <div>
              {inviteErrors.length === 1 ? "This invite wasn't sent:" : "These invites weren't sent:"}
              <ul className="confirm-list">
                {inviteErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
              The client is saved either way; invite them again from Settings → Team.
            </div>
          </div>
        )}
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

      {inviteRoles.length > 0 && (
        <div className="field">
          <label>
            Invite People <span className="hint">optional</span>
          </label>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 8 }}>
            They&rsquo;re emailed a link to join, and you&rsquo;ll get the links to share too. Owners and Admins see
            every client; a User gets this one; a Client is from it and sees only its public comments.
            {placesLeft !== null &&
              ` ${placesLeft} team place${placesLeft === 1 ? "" : "s"} left on your plan; Clients don't use one.`}
          </div>
          {invites.map((v, i) => (
            <div className="brow" key={i}>
              <div className="brow-h">
                <div className="invrow">
                  <input
                    value={v.firstName}
                    onChange={(e) => updateInvite(i, { firstName: e.target.value })}
                    placeholder="First name"
                    aria-label="First name"
                  />
                  <input
                    value={v.lastName}
                    onChange={(e) => updateInvite(i, { lastName: e.target.value })}
                    placeholder="Last name"
                    aria-label="Last name"
                  />
                  <input
                    value={v.email}
                    onChange={(e) => updateInvite(i, { email: e.target.value })}
                    placeholder="Email"
                    type="email"
                    aria-label="Email"
                  />
                  <select
                    value={v.role}
                    onChange={(e) => updateInvite(i, { role: e.target.value as InviteRole })}
                    aria-label="Role"
                  >
                    {inviteRoles.map((r) => (
                      <option key={r} value={r}>
                        {INVITE_ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="brx"
                  title="Remove"
                  onClick={() => setInvites((prev) => prev.filter((_, j) => j !== i))}
                >
                  <RemoveIcon />
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="badd"
            onClick={() => setInvites((prev) => [...prev, { firstName: "", lastName: "", email: "", role: "user" }])}
          >
            + Invite someone
          </button>
        </div>
      )}

      {submitError && <p className="autherr">{submitError}</p>}
    </Modal>
    <ClientLogoCropper draft={draft} />
    </>
  );
}
