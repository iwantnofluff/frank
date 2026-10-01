"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ClientChecklist } from "@/components/team/ClientChecklist";
import { useClients } from "@/hooks/use-clients";
import { useUpdateMember } from "@/hooks/use-manage-member";
import { errorMessage } from "@/lib/errors";
import { INVITABLE_ROLES, ROLE_HINTS, ROLE_LABELS, type InvitableRole } from "@/lib/roles";

export function EditMemberModal({
  agencyId,
  membershipId,
  name,
  role: currentRole,
  currentClientIds,
  onClose,
  onSaved,
}: {
  agencyId: string;
  membershipId: string;
  name: string;
  role: InvitableRole;
  currentClientIds: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const update = useUpdateMember(agencyId);
  const { data: clients } = useClients();
  const activeClients = (clients ?? []).filter((c) => !c.archived_at);
  const [role, setRole] = useState<InvitableRole>(currentRole);
  const [clientIds, setClientIds] = useState<string[]>(currentClientIds);

  const unchanged =
    role === currentRole &&
    (role !== "user" ||
      (clientIds.length === currentClientIds.length &&
        clientIds.every((id) => currentClientIds.includes(id))));

  async function handleSave() {
    await update.mutateAsync({
      membershipId,
      role,
      roleChanged: role !== currentRole,
      clientIds,
      currentClientIds,
    });
    onSaved();
  }

  return (
    <Modal hideCloseButton
      title={`Edit ${name}`}
      ariaLabel={`Edit ${name}`}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <div className="grow" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={update.isPending || unchanged}
            onClick={() => handleSave().catch(() => {})}
          >
            {update.isPending ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="edRole">Role</label>
        <select id="edRole" value={role} onChange={(e) => setRole(e.target.value as InvitableRole)}>
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
      {update.error && (
        <p className="autherr">{errorMessage(update.error, "Couldn't save these changes")}</p>
      )}
    </Modal>
  );
}
