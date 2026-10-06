"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useViewportFit } from "@/hooks/use-viewport-fit";
import { usePresence } from "@/hooks/use-presence";

// The agency's mark at the top of the rail (its logo, or "F"). For staff it
// opens a menu with Settings (direct instruction: Settings moved here from
// the rail); for a client's own people it's just the mark.
export function AgencyMenu({
  mark,
  agencyName,
  isStaff,
  hasLogo,
}: {
  mark: React.ReactNode;
  agencyName: string | null;
  isStaff: boolean;
  // A logo fills the mark edge to edge.
  hasLogo: boolean;
}) {
  const markStyle = hasLogo ? { overflow: "hidden" as const, padding: 0 } : undefined;
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const pop = usePresence(anchor);
  const ref = useRef<HTMLDivElement>(null);
  useViewportFit(ref, pop.shown, { side: "beside", gap: 10 });

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

  if (!isStaff)
    return (
      <div className="mark" style={markStyle}>
        {mark}
      </div>
    );

  return (
    <>
      <button
        type="button"
        className="mark markbtn"
        style={markStyle}
        title={agencyName ?? "Agency"}
        aria-label={`${agencyName ?? "Agency"} menu`}
        aria-expanded={!!anchor}
        onMouseDown={(e) => {
          // So the outside-click handler doesn't close and reopen it.
          if (anchor) e.stopPropagation();
        }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setAnchor((prev) => (prev ? null : rect));
        }}
      >
        {mark}
      </button>
      {pop.shown && (
        <div
          className={`colpop on motion${pop.isOpen ? " is-open" : ""}`}
          ref={ref}
          role="menu"
          aria-label={agencyName ?? "Agency"}
          style={{ width: 220 }}
        >
          {agencyName && (
            <div className="cp-h">
              <b>{agencyName}</b>
            </div>
          )}
          <div className="cp-b" style={{ padding: "4px 4px" }}>
            <Link href="/settings" className="cpr" role="menuitem" onClick={() => setAnchor(null)}>
              <span className="cn">Settings</span>
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
