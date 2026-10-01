"use client";

import { useEffect, useRef, useState } from "react";
import { useViewportFit } from "@/hooks/use-viewport-fit";

// The prototype's .split button (#briefWrap: New Brief + a caret, "How to
// add it"): the main part does the default action, the caret opens a small
// menu of alternatives — the same .colpop/.cpr shell RowActionsMenu uses.
export function SplitButton({
  label,
  onClick,
  menuLabel,
  items,
}: {
  label: string;
  onClick: () => void;
  menuLabel: string;
  items: { label: string; hint?: string; onClick: () => void }[];
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useViewportFit(ref, anchor, { side: "below", gap: 4, align: "end" });

  useEffect(() => {
    if (!anchor) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAnchor(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAnchor(null);
    }
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [anchor]);

  return (
    <span className="split">
      <button type="button" className="btn primary" onClick={onClick}>
        {label}
      </button>
      <button
        type="button"
        className="btn primary split-t"
        title={menuLabel}
        aria-label={menuLabel}
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setAnchor((prev) => (prev ? null : rect));
        }}
      >
        <svg viewBox="0 0 24 24">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {anchor && (
        <div className="colpop on" ref={ref} role="menu" aria-label={menuLabel} style={{ width: 230 }}>
          <div className="cp-b" style={{ padding: "4px 4px" }}>
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className="cpr"
                onClick={() => {
                  setAnchor(null);
                  item.onClick();
                }}
              >
                <span className="cn">{item.label}</span>
                {item.hint && <span className="cs">{item.hint}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}
