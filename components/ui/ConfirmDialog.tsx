"use client";

import { Modal } from "@/components/ui/Modal";
import { useMyFirstName } from "@/hooks/use-my-profile";
import { addressed } from "@/lib/greetings";
import { errorMessage } from "@/lib/errors";

// The small "are you sure?" window: one message, addressed to whoever is
// signed in ("Raj, this post will be gone…"), then Cancel and the action.
// `message` is written to follow a name and a comma; without a name it's
// shown on its own, capitalised. With no `onConfirm` it only explains
// (e.g. why something can't be deleted) and offers Close.
export function ConfirmDialog({
  title,
  message,
  details,
  confirmLabel,
  pendingLabel,
  isPending = false,
  error,
  errorFallback = "Something went wrong",
  onConfirm,
  onClose,
  tone = "danger",
}: {
  title: string;
  message: string;
  // Supporting points, listed under the message (e.g. why a change needs it).
  details?: string[];
  confirmLabel?: string;
  pendingLabel?: string;
  isPending?: boolean;
  error?: unknown;
  errorFallback?: string;
  onConfirm?: () => void;
  onClose: () => void;
  // "primary" for a confirmation that isn't destructive (choosing a plan).
  tone?: "danger" | "primary";
}) {
  const firstName = useMyFirstName();
  return (
    <Modal hideCloseButton title={title} size="sm" onClose={onClose}>
      <p className="sub">{addressed(firstName, message)}</p>
      {details && details.length > 0 && (
        <ul className="confirm-list">
          {details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
      {!!error && <p className="autherr">{errorMessage(error, errorFallback)}</p>}
      <div className="confirm-acts">
        <button type="button" className="btn" onClick={onClose}>
          {onConfirm ? "Cancel" : "Close"}
        </button>
        {onConfirm && (
          <button type="button" className={`btn ${tone}`} disabled={isPending} onClick={onConfirm}>
            {isPending ? (pendingLabel ?? confirmLabel) : confirmLabel}
          </button>
        )}
      </div>
    </Modal>
  );
}
