"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ClientChecklist } from "@/components/team/ClientChecklist";
import { useClients } from "@/hooks/use-clients";
import { useInviteMember } from "@/hooks/use-invite-member";
import { errorMessage } from "@/lib/errors";
import { INVITABLE_ROLES, ROLE_HINTS, ROLE_LABELS, type InvitableRole } from "@/lib/roles";

export function InviteMemberModal({
  agencyId,
  onClose,
  onSent,
}: {
  agencyId: string;
  onClose: () => void;
  onSent: (email: string) => void;
}) {
  const invite = useInviteMember();
  const { data: clients } = useClients();
  const activeClients = (clients ?? []).filter((c) => !c.archived_at);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableRole>("user");
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [validation, setValidation] = useState<string | null>(null);

  async function handleSubmit() {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setValidation("Enter a valid email");
      return;
    }
    setValidation(null);
    await invite.mutateAsync({ agencyId, email: trimmed, role, clientIds });
    onSent(trimmed);
  }

  return (
    <Modal
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
      <div className="field">
        <label htmlFor="ivEmail">Email Address</label>
        <input
          id="ivEmail"
          type="email"
          autoFocus
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
        <select id="ivRole" value={role} onChange={(e) => setRole(e.target.value as InvitableRole)}>
          {INVITABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <div className="hint" style={{ marginTop: 5 }}>
          {ROLE_HINTS[role]}
        </div>
      </div>
      {role === "user" && (
        <div className="field">
          <label>Client Access</label>
          <ClientChecklist clients={activeClients} selected={clientIds} onChange={setClientIds} />
        </div>
      )}
      {validation && <p className="autherr">{validation}</p>}
      {invite.error && <p className="autherr">{errorMessage(invite.error, "Couldn't send the invite")}</p>}
    </Modal>
  );
}
