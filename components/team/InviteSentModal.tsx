"use client";

import { Modal } from "@/components/ui/Modal";
import { InviteLinks } from "@/components/team/InviteLinks";
import type { SentInvite } from "@/hooks/use-invite-member";

// A resent invite's link, in its own window with a Close button (direct
// instruction: it used to sit under the list and never went away).
export function InviteSentModal({ sent, onClose }: { sent: SentInvite; onClose: () => void }) {
  return (
    <Modal
      hideCloseButton
      size="sm"
      title="Invite Sent"
      onClose={onClose}
      footer={
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      }
    >
      <InviteLinks sent={[sent]} />
    </Modal>
  );
}
