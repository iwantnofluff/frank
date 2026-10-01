"use client";

import { useEffect, useRef } from "react";

export function Modal({
  title,
  ariaLabel,
  onClose,
  children,
  footer,
  size,
  hideCloseButton = false,
}: {
  // A plain string for every existing caller; CreativeModal passes a
  // richer two-line node (project name + post name/format) instead, which
  // is why ariaLabel exists — aria-label itself must stay a plain string.
  title: React.ReactNode;
  ariaLabel?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  // Matches the prototype's .modal.sm (max-width:420px) — the default
  // width is meant for content-heavy forms like New Brief.
  size?: "sm";
  // Per direct instruction, a window with a Cancel button doesn't also get
  // the corner X — every such caller passes this. Escape and clicking the
  // scrim still close it. Only a window with no Cancel (Share for Review,
  // which has Done; the knowledge file preview) keeps the X.
  hideCloseButton?: boolean;
}) {
  const scrim = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // With one modal open over another (the client image cropper over Edit
      // Client), Escape closes only the topmost — the last scrim in the page.
      const scrims = document.querySelectorAll(".scrim");
      if (scrims[scrims.length - 1] !== scrim.current) return;
      onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="scrim" ref={scrim} onClick={onClose}>
      <div
        className={size === "sm" ? "modal sm" : "modal"}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? (typeof title === "string" ? title : undefined)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-h">
          <div className="modal-title">{title}</div>
          {!hideCloseButton && (
            <button type="button" className="iconbtn" onClick={onClose} title="Close">
              <svg viewBox="0 0 24 24">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}
