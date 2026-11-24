"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { formatVideoTime } from "@/lib/annotations";

// A paused frame, checked before it's used as the thumbnail (direct
// instruction: larger and in the middle, as the other windows are, not a
// small popover over the video). Nothing is saved until the button.
export function FrameDialog({
  frame,
  title,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  frame: { url: string; file: File; t: number };
  title: string;
  confirmLabel: string;
  onConfirm: (file: File, t: number) => Promise<void> | void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => URL.revokeObjectURL(frame.url), [frame.url]);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(frame.file, frame.t);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "It couldn't be saved.");
      setBusy(false);
    }
  }

  return (
    <Modal
      title={title}
      hideCloseButton
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <>
          <div className="grow" />
          <button type="button" className="btn" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void confirm()}>
            {busy ? "Saving…" : confirmLabel}
          </button>
        </>
      }
    >
      <div className="framedlg">
        {/* eslint-disable-next-line @next/next/no-img-element -- a local preview */}
        <img src={frame.url} alt={`The frame at ${formatVideoTime(frame.t)}`} />
        <p className="sub">From the video at {formatVideoTime(frame.t)}.</p>
        {error && <p className="autherr">{error}</p>}
      </div>
    </Modal>
  );
}
