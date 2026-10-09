"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { errorMessage } from "@/lib/errors";

// Every admin action inside an agency asks why (phase51). The reason is
// logged, and the agency's Owners can read it.
export function AdminActionModal({
  title,
  message,
  confirmLabel,
  isPending,
  error,
  children,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  isPending: boolean;
  error: unknown;
  // The action's own fields, above the reason.
  children?: React.ReactNode;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const ready = reason.trim().length > 0;
  return (
    <Modal
      hideCloseButton
      title={title}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!ready || isPending}
            onClick={() => onConfirm(reason.trim())}
          >
            {isPending ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      <p className="sub" style={{ marginTop: 0 }}>
        {message}
      </p>
      {children}
      <div className="field">
        <label htmlFor="adReason">
          Reason <span className="hint">the workspace&rsquo;s Owners will see this</span>
        </label>
        <textarea
          id="adReason"
          rows={3}
          maxLength={500}
          value={reason}
          autoFocus
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Asked by their Owner on a support call"
        />
      </div>
      {!!error && <p className="autherr">{errorMessage(error, "Couldn't do that")}</p>}
    </Modal>
  );
}
