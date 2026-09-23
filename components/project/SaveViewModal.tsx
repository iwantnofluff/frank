"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";

// Used both to save the current column layout as a brand-new view and to
// rename the currently active one — same shape (a name field, a
// Cancel/Save footer), so one small modal covers both rather than two
// near-identical components.
export function SaveViewModal({
  mode,
  initialName,
  existingNames,
  submitError,
  isSaving,
  onCancel,
  onSave,
}: {
  mode: "create" | "rename";
  initialName: string;
  existingNames: string[];
  submitError?: string | null;
  isSaving?: boolean;
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give this view a name.");
      return;
    }
    if (existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
      setError("A view with this name already exists.");
      return;
    }
    onSave(trimmed);
  }

  return (
    <Modal
      title={mode === "create" ? "Save as New View" : "Rename View"}
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <div className="grow" />
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={isSaving} onClick={handleSave}>
            {isSaving ? "Saving…" : mode === "create" ? "Save" : "Rename"}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="viewName">View Name</label>
        <input
          id="viewName"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(null);
          }}
          placeholder="e.g. Raj Test"
          autoFocus
        />
        {error && <p className="autherr">{error}</p>}
      </div>
      {mode === "create" && (
        <p className="sub" style={{ marginTop: 0 }}>
          Saved for every project you can see — not just this one.
        </p>
      )}
      {submitError && <p className="autherr">{submitError}</p>}
    </Modal>
  );
}
