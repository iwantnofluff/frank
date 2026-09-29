"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useRenameProject } from "@/hooks/use-rename-project";
import { errorMessage } from "@/lib/errors";

// Same shape as NewProjectModal's own name field — a duplicate name
// surfaces as the raw projects_client_name_key unique-constraint error via
// errorMessage(), not specially handled, matching that create modal's own
// choice not to.
export function RenameProjectModal({
  projectId,
  clientId,
  currentName,
  onClose,
}: {
  projectId: string;
  clientId: string;
  currentName: string;
  onClose: () => void;
}) {
  const renameProject = useRenameProject();

  const [name, setName] = useState(currentName);
  const [nameError, setNameError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim()) {
      setNameError("Give it a name first.");
      return;
    }
    setNameError(null);

    await renameProject.mutateAsync({ projectId, clientId, name: name.trim() });
    onClose();
  }

  const submitError = renameProject.error
    ? errorMessage(renameProject.error, "Couldn't rename the project")
    : null;

  return (
    <Modal
      title="Rename Project"
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
            disabled={renameProject.isPending}
            onClick={handleSubmit}
          >
            {renameProject.isPending ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="rpName">Project name</label>
        <input
          id="rpName"
          value={name}
          autoFocus
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError(null);
          }}
        />
        {nameError && <p className="autherr">{nameError}</p>}
      </div>

      {submitError && <p className="autherr">{submitError}</p>}
    </Modal>
  );
}
