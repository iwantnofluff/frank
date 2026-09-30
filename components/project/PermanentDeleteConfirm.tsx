"use client";

import { Modal } from "@/components/ui/Modal";
import { errorMessage } from "@/lib/errors";

// One shared confirmation for both calendar tables' checkbox-select bar —
// the one destructive, non-reversible action next to the reversible
// Archive, so it gets a pause of its own rather than firing on a single
// click like Archive/Restore do.
export function PermanentDeleteConfirm({
  count,
  isPending,
  error,
  onConfirm,
  onClose,
}: {
  count: number;
  isPending: boolean;
  error: unknown;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Permanently delete?" size="sm" onClose={onClose}>
      <p className="sub">
        {count === 1
          ? "This post"
          : `These ${count} posts`}{" "}
        will be gone for good — including every comment, version and
        share link that pointed at{" "}
        {count === 1 ? "it" : "them"}. This can&rsquo;t be undone.
      </p>
      {!!error && <p className="autherr">{errorMessage(error, "Couldn't delete these posts")}</p>}
      <div className="frow" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn danger" disabled={isPending} onClick={onConfirm}>
          {isPending ? "Deleting…" : "Permanently Delete"}
        </button>
      </div>
    </Modal>
  );
}
