"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useUpdateProject } from "@/hooks/use-update-project";
import { PROJECT_TYPE_OPTS } from "@/lib/project-types";
import { errorMessage } from "@/lib/errors";

// Same name and Type fields as NewProjectModal. Type's options follow the
// project's delivery kind, which isn't offered here: the database refuses
// to change it once a project has posts (projects_delivery_immutable). A
// current type outside today's list — or none at all, on older projects —
// stays selectable so saving never rewrites it unasked.
export function EditProjectModal({
  projectId,
  clientId,
  currentName,
  currentType,
  delivery,
  onClose,
}: {
  projectId: string;
  clientId: string;
  currentName: string;
  currentType: string | null;
  delivery: "scheduled" | "continuous";
  onClose: () => void;
}) {
  const updateProject = useUpdateProject();

  const [name, setName] = useState(currentName);
  const [type, setType] = useState(currentType ?? "");
  const [nameError, setNameError] = useState<string | null>(null);

  const options = PROJECT_TYPE_OPTS[delivery];
  const keepsUnlistedType = !!currentType && !options.includes(currentType);

  async function handleSubmit() {
    if (!name.trim()) {
      setNameError("Give it a name first.");
      return;
    }
    setNameError(null);

    await updateProject.mutateAsync({
      projectId,
      clientId,
      name: name.trim(),
      type: type || null,
    });
    onClose();
  }

  const submitError = updateProject.error
    ? errorMessage(updateProject.error, "Couldn't save the project")
    : null;

  return (
    <Modal hideCloseButton
      title="Edit Project"
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
            disabled={updateProject.isPending}
            onClick={handleSubmit}
          >
            {updateProject.isPending ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="epName">Project name</label>
        <input
          id="epName"
          value={name}
          autoFocus
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError(null);
          }}
        />
        {nameError && <p className="autherr">{nameError}</p>}
      </div>

      <div className="field">
        <label htmlFor="epType">Type</label>
        <select id="epType" value={type} onChange={(e) => setType(e.target.value)}>
          {!currentType && <option value="">—</option>}
          {keepsUnlistedType && <option value={currentType!}>{currentType}</option>}
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>

      {submitError && <p className="autherr">{submitError}</p>}
    </Modal>
  );
}
