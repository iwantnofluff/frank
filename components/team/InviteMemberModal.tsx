"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ClientChecklist } from "@/components/team/ClientChecklist";
import { InviteLinks } from "@/components/team/InviteLinks";
import { useClients } from "@/hooks/use-clients";
import { useInviteMember, type SentInvite } from "@/hooks/use-invite-member";
import { errorMessage } from "@/lib/errors";
import { INVITE_ROLE_HINTS, INVITE_ROLE_LABELS, type InviteRole } from "@/lib/roles";

// Inviting one person from Team → Users (phase44): their name, email and
// role — only the roles this person may give (rolesICanInvite) — then the
// link to share directly, as well as the email.
export function InviteMemberModal({
  agencyId,
  roles,
  onClose,
  onSent,
}: {
  agencyId: string;
  roles: InviteRole[];
  onClose: () => void;
  onSent: (email: string) => void;
}) {
  const invite = useInviteMember();
  const { data: clients } = useClients();
  const activeClients = (clients ?? []).filter((c) => !c.archived_at);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>(roles.includes("user") ? "user" : roles[0]);
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [clientId, setClientId] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const [sent, setSent] = useState<SentInvite | null>(null);

  async function handleSubmit() {
    const trimmed = email.trim();
    if (!firstName.trim() || !lastName.trim()) return setValidation("Enter their first and last name");
    if (!trimmed || !trimmed.includes("@")) return setValidation("Enter a valid email");
    if (role === "client" && !clientId) return setValidation("Choose the client they're from");
    setValidation(null);
    const result = await invite.mutateAsync({
      agencyId,
      email: trimmed,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role,
      clientIds: role === "client" ? [clientId] : role === "user" ? clientIds : [],
    });
    setSent(result);
    onSent(trimmed);
  }

  if (sent) {
    return (
      <Modal
        hideCloseButton
        title="Invite Sent"
        size="sm"
        onClose={onClose}
        footer={
          <button type="button" className="btn primary" onClick={onClose}>
            Done
          </button>
        }
      >
        <InviteLinks sent={[sent]} />
      </Modal>
    );
  }

  return (
    <Modal
      hideCloseButton
      title="Invite Team Member"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <span className="grow">Invite link expires in 48 hours</span>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={invite.isPending}
            onClick={() => handleSubmit().catch(() => {})}
          >
            {invite.isPending ? "Sending…" : "Send Invite"}
          </button>
        </>
      }
    >
      <div className="frow">
        <div className="field">
          <label htmlFor="ivFirst">First Name</label>
          <input id="ivFirst" autoFocus value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ivLast">Last Name</label>
          <input id="ivLast" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="ivEmail">Email Address</label>
        <input
          id="ivEmail"
          type="email"
          placeholder="name@nofluff.in"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit().catch(() => {});
          }}
        />
      </div>
      <div className="field">
        <label htmlFor="ivRole">Role</label>
        <select id="ivRole" value={role} onChange={(e) => setRole(e.target.value as InviteRole)}>
          {roles.map((r) => (
            <option key={r} value={r}>
              {INVITE_ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <div className="hint" style={{ marginTop: 5 }}>
          {INVITE_ROLE_HINTS[role]}
        </div>
      </div>
      {role === "user" && (
        <div className="field">
          <label>Client Access</label>
          <ClientChecklist clients={activeClients} selected={clientIds} onChange={setClientIds} />
        </div>
      )}
      {role === "client" && (
        <div className="field">
          <label htmlFor="ivClient">Their Client</label>
          <select id="ivClient" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Choose a client</option>
            {activeClients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {validation && <p className="autherr">{validation}</p>}
      {invite.error && <p className="autherr">{errorMessage(invite.error, "Couldn't send the invite")}</p>}
    </Modal>
  );
}
