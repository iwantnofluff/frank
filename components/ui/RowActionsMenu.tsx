"use client";

import { useEffect, useRef, useState } from "react";
import { usePresence } from "@/hooks/use-presence";
import { useViewportFit } from "@/hooks/use-viewport-fit";

function DotsIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="4" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="20" r="1.5" />
    </svg>
  );
}

const POPOVER_WIDTH = 160;

// Same .vdots/.colpop/.cp-b/.cpr shell ProjectCalendarTable's own saved-view
// "..." menu already uses (Rename/Delete) — extracted here since this one
// has several independent call sites (client rows, project rows, and each
// entity's own detail-page header) rather than the single one that shell
// was originally built for.
//
// Self-contained open/anchor state and its own outside-click/Escape close
// (ColumnsPopover's own shape), rather than a parent-owned anchor prop —
// each call site just drops this in with no positioning plumbing of its
// own. Every click here calls stopPropagation() first: every call site
// sits inside a <Link className="crow"> row that must not navigate when
// the menu itself is being used.
export function RowActionsMenu({
  items,
  title = "Options",
}: {
  items: { label: string; onClick: () => void; tone?: "danger" }[];
  title?: string;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  // Opens and closes with motion (hooks/use-presence.ts).
  const pop = usePresence(anchor);
  const ref = useRef<HTMLDivElement>(null);
  // The trigger often sits at the right edge of a table, or near the bottom
  // of a long list — kept fully on-screen either way (flips above the
  // trigger when there's no room below).
  useViewportFit(ref, pop.shown, { side: "below", gap: 4 });

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
    <>
      <button
        type="button"
        className="vdots"
        title={title}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          // React nulls out currentTarget once the handler returns, so it
          // must be read now, not inside the setState updater below (which
          // runs later, during React's own render phase).
          const rect = e.currentTarget.getBoundingClientRect();
          setAnchor((prev) => (prev ? null : rect));
        }}
      >
        <DotsIcon />
      </button>
      {pop.shown && (
        <div
          className={`colpop on motion${pop.isOpen ? " is-open" : ""}`}
          ref={ref}
          style={{ width: POPOVER_WIDTH }}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          <div className="cp-b" style={{ padding: "4px 4px" }}>
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                className="cpr"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setAnchor(null);
                  item.onClick();
                }}
              >
                <span className="cn" style={item.tone === "danger" ? { color: "var(--rose)" } : undefined}>
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
