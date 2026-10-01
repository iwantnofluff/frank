"use client";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

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
  const what = count === 1 ? "this post" : `these ${count} posts`;
  const it = count === 1 ? "it" : "them";
  return (
    <ConfirmDialog
      title="Permanently delete?"
      message={`${what} will be gone for good — including every comment, version and share link that pointed at ${it}. This can't be undone.`}
      confirmLabel="Permanently Delete"
      pendingLabel="Deleting…"
      isPending={isPending}
      error={error}
      errorFallback="Couldn't delete these posts"
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
