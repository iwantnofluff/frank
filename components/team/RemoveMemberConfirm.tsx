"use client";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

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
    <ConfirmDialog
      title="Remove from team?"
      message={`${name} will lose all access to ${agencyName} straight away. Their name stays on comments and work they've already done. To bring them back, you'd send a new invite.`}
      confirmLabel="Remove from Team"
      pendingLabel="Removing…"
      isPending={isPending}
      error={error}
      errorFallback="Couldn't remove this member"
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
