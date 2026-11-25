"use client";

import { useEffect, useRef, useState } from "react";
import { usePresence } from "@/hooks/use-presence";
import { useViewportFit } from "@/hooks/use-viewport-fit";

// A multi-select filter for the admin tables (direct instruction), as the
// planner's Status filter reads (StatusFilterMenu): a button naming what's
// ticked, and a list with All at the top to tick or clear them all.
export function AdminFilterMenu<T extends string>({
  label,
  allLabel,
  plural,
  options,
  value,
  onChange,
}: {
  label: string; // the button's accessible name, "Workspace"
  allLabel: string; // "All Workspaces"
  plural: string; // "Workspaces", for "3 Workspaces"
  options: { value: T; label: string }[];
  value: T[];
  onChange: (next: T[]) => void;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const pop = usePresence(anchor);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useViewportFit(ref, pop.shown, { side: "below", gap: 4, align: "start" });

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

  const all = options.length > 0 && options.every((o) => value.includes(o.value));
  // Kept in the list's own order, whatever order they're ticked in.
  const toggle = (v: T) => onChange(options.map((o) => o.value).filter((o) => (o === v ? !value.includes(v) : value.includes(o))));
  const picked = options.filter((o) => value.includes(o.value));
  const text = all ? allLabel : picked.length === 0 ? `No ${plural}` : picked.length === 1 ? picked[0].label : `${picked.length} ${plural}`;

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
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={!!anchor}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setAnchor((prev) => (prev ? null : rect));
        }}
      >
        {text}
      </button>
      {pop.shown && (
        <div className={`colpop on fmtpop motion${pop.isOpen ? " is-open" : ""}`} ref={ref} role="dialog" aria-label={plural} style={{ width: 260 }}>
          <div className="cp-b">
            <button type="button" className="cpr" role="checkbox" aria-checked={all} onClick={() => onChange(all ? [] : options.map((o) => o.value))}>
              {tick(all)}
              <span className="cn">
                <b>{allLabel}</b>
              </span>
            </button>
            {options.map((o) => (
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
