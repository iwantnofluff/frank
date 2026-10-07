"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { CLOSE_MS } from "@/hooks/use-presence";

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
  // lg: the Project and Client Profile windows (phase46).
  size?: "sm" | "lg";
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
      const scrims = document.querySelectorAll(".scrim:not(.closing)");
      if (scrims[scrims.length - 1] !== scrim.current) return;
      onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Opening and closing motion (direct instruction: every window, the same
  // curves as the menus). Opening: .is-open a frame after it appears.
  // Closing: callers remove a window straight away, so on the way out it
  // leaves a copy of itself where it was, which plays the close and is
  // then removed. The copy is inert and hidden from assistive technology,
  // so nothing can click or find it while it goes.
  useLayoutEffect(() => {
    const el = scrim.current;
    const frame = requestAnimationFrame(() => el?.classList.add("is-open"));
    return () => {
      cancelAnimationFrame(frame);
      // Only a window that has opened closes with motion (not one set up
      // and torn down in the same moment).
      if (!el || !el.isConnected || !el.classList.contains("is-open")) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const ghost = el.cloneNode(true) as HTMLElement;
      ghost.classList.add("closing");
      ghost.setAttribute("aria-hidden", "true");
      ghost.inert = true;
      document.body.appendChild(ghost);
      // Removed one frame later, so it starts from open, plays, and goes.
      requestAnimationFrame(() => ghost.classList.remove("is-open"));
      setTimeout(() => ghost.remove(), CLOSE_MS + 40);
    };
  }, []);

  return (
    <div className="scrim" ref={scrim} onClick={onClose}>
      <div
        className={size ? `modal ${size}` : "modal"}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? (typeof title === "string" ? title : undefined)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-h">
          {/* Frank's logomark on every window (direct instruction). */}
          {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG */}
          <img className="modal-mark" src="/brand/frank-logomark.svg" alt="" aria-hidden="true" />
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
