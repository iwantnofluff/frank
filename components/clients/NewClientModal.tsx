"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useCreateClient } from "@/hooks/use-create-client";
import { errorMessage } from "@/lib/errors";

// Ports frank-prototype.html's #clientScrim/#newClientBtn. The prototype's
// own #ncSave handler never actually sends an invite for the approver
// email — it just appends "— invite sent to X" to a toast with no backend
// behind it. Real invite-sending needs an auth flow this codebase doesn't
// have yet (creating the user record, a membership row, delivering the
// email) — nothing in Settings → Team has it built either (use-team-members
// is read-only). The field is kept for prototype parity and captured here,
// but doesn't yet create a membership; see docs/parity-gaps.md.
export function NewClientModal({
  agencyId,
  activeClientCount,
  onClose,
}: {
  agencyId: string;
  activeClientCount: number;
  onClose: () => void;
}) {
  const createClient = useCreateClient();

  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [approverEmail, setApproverEmail] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim()) {
      setNameError("Give the client a name.");
      return;
    }
    setNameError(null);

    await createClient.mutateAsync({
      agencyId,
      name: name.trim(),
      industry: industry.trim(),
    });
    onClose();
  }

  const submitError = createClient.error
    ? errorMessage(createClient.error, "Couldn't create the client")
    : null;

  return (
    <Modal
      title="New Client"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <span className="grow">{activeClientCount} of 10 clients used</span>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={createClient.isPending}
            onClick={handleSubmit}
          >
            {createClient.isPending ? "Creating…" : "Create Client"}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="ncName">Client Name</label>
        <input
          id="ncName"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError(null);
          }}
          placeholder="e.g. Lotus Skincare"
        />
        {nameError && <p className="autherr">{nameError}</p>}
      </div>

      <div className="field">
        <label htmlFor="ncInd">
          Industry <span className="hint">optional</span>
        </label>
        <input
          id="ncInd"
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder="e.g. D2C beauty"
        />
      </div>

      <div className="field">
        <label htmlFor="ncEmail">Primary Approver Email</label>
        <input
          id="ncEmail"
          value={approverEmail}
          onChange={(e) => setApproverEmail(e.target.value)}
          placeholder="name@company.com"
        />
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 5 }}>
          They get an invite and become the only person who can approve work.
        </div>
      </div>

      {submitError && <p className="autherr">{submitError}</p>}
    </Modal>
  );
}
