"use client";

import { Modal } from "@/components/ui/Modal";
import { errorMessage } from "@/lib/errors";

export function RemoveMemberConfirm({
  name,
  agencyName,
  isPending,
  error,
  onConfirm,
  onClose,
}: {
  name: string;
  agencyName: string;
  isPending: boolean;
  error: unknown;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Remove from team?" size="sm" onClose={onClose}>
      <p className="sub">
        {name} will lose all access to {agencyName} straight away. Their name stays on comments and
        work they&rsquo;ve already done. To bring them back, you&rsquo;d send a new invite.
      </p>
      {!!error && <p className="autherr">{errorMessage(error, "Couldn't remove this member")}</p>}
      <div className="frow" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn danger" disabled={isPending} onClick={onConfirm}>
          {isPending ? "Removing…" : "Remove from Team"}
        </button>
      </div>
    </Modal>
  );
}
