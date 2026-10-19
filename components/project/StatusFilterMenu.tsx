"use client";

import { useEffect, useRef, useState } from "react";
import { usePresence } from "@/hooks/use-presence";
import { useViewportFit } from "@/hooks/use-viewport-fit";
import { ALL_STATUSES, STATUS_OPTIONS, statusFilterLabel, type StatusKey } from "@/lib/post-filters";
import { IDEA, stageColor } from "@/lib/stage-labels";

// The tables' status filter (direct instruction): any combination of Idea
// and the six stages, ticked in a list like the Format picker's, with All
// Statuses at the top to tick or clear them all. Reads like the Platform
// select beside it.
export function StatusFilterMenu({ value, onChange }: { value: StatusKey[]; onChange: (next: StatusKey[]) => void }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const pop = usePresence(anchor);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useViewportFit(ref, pop.shown, { side: "below", gap: 4, align: "end" });

  useEffect(() => {
    if (!anchor) return;
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setAnchor(null);
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

  const all = value.length === ALL_STATUSES.length;
  // Kept in the list's own order, whatever order they're ticked in.
  const toggle = (k: StatusKey) =>
    onChange(ALL_STATUSES.filter((s) => (s === k ? !value.includes(k) : value.includes(s))));

  const tick = (on: boolean) => (
    <span className={`cbx${on ? " on" : ""}`}>
      <svg viewBox="0 0 24 24">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </span>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="sort sortbtn"
        aria-label="Status"
        aria-haspopup="dialog"
        aria-expanded={!!anchor}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setAnchor((prev) => (prev ? null : rect));
        }}
      >
        {statusFilterLabel(value)}
      </button>
      {pop.shown && (
        <div className={`colpop on fmtpop motion${pop.isOpen ? " is-open" : ""}`} ref={ref} role="dialog" aria-label="Statuses" style={{ width: 240 }}>
          <div className="cp-b">
            <button type="button" className="cpr" role="checkbox" aria-checked={all} onClick={() => onChange(all ? [] : ALL_STATUSES)}>
              {tick(all)}
              <span className="cn">
                <b>All Statuses</b>
              </span>
            </button>
            {STATUS_OPTIONS.map((o) => (
              <button
                type="button"
                key={o.value}
                className="cpr"
                role="checkbox"
                aria-checked={value.includes(o.value)}
                aria-label={o.label}
                onClick={() => toggle(o.value)}
              >
                {tick(value.includes(o.value))}
                <span className="sfdot" style={{ background: o.value === "idea" ? IDEA.color : stageColor(Number(o.value), null) }} />
                <span className="cn">{o.label}</span>
              </button>
            ))}
          </div>
          <div className="fmtpop-f">
            <button type="button" className="btn primary sm" onClick={() => setAnchor(null)}>
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}
