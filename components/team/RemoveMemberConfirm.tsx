"use client";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export function RemoveMemberConfirm({
  name,
  agencyName,
  clientName,
  isPending,
  error,
  onConfirm,
  onClose,
}: {
  name: string;
  agencyName: string;
  // Set for a Client: their name also comes off that client's review links.
  clientName?: string;
  isPending: boolean;
  error: unknown;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      title="Remove from team?"
      message={
        clientName
          ? `${name} will lose all access to ${agencyName} straight away, and their name comes off ${clientName}'s review links. Their name stays on comments they've already made. To bring them back, you'd send a new invite.`
          : `${name} will lose all access to ${agencyName} straight away. Their name stays on comments and work they've already done. To bring them back, you'd send a new invite.`
      }
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
