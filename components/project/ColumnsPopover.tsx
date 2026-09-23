"use client";

import { useEffect, useRef, useState } from "react";

export interface ToggleableColumn {
  key: string;
  label: string;
  sub: string;
}

// Ports frank-prototype.html's #colpop (renderColPicker) — show/hide only,
// not the drag-to-reorder or per-column resize the prototype's picker also
// offers (docs/parity-gaps.md). Week/Date/Day aren't listed here at all —
// they're frozen (see ProjectCalendarTable's FROZEN_COLUMNS) and always on.
export function ColumnsPopover({
  anchorRect,
  columns,
  visibility,
  frozenCount,
  onToggle,
  onToggleAll,
  onClose,
}: {
  anchorRect: DOMRect;
  columns: ToggleableColumn[];
  visibility: Record<string, boolean>;
  frozenCount: number;
  onToggle: (key: string) => void;
  onToggleAll: (checked: boolean) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const visibleCount = frozenCount + columns.filter((c) => visibility[c.key] !== false).length;
  const totalCount = frozenCount + columns.length;
  const allShown = visibleCount === totalCount;

  const filtered = columns.filter((c) => c.label.toLowerCase().includes(query.trim().toLowerCase()));

  const pw = 330;
  let left = anchorRect.right - pw;
  if (left < 8) left = 8;
  const top = anchorRect.bottom + 6;

  return (
    <div className="colpop on" style={{ left, top }} ref={ref}>
      <div className="cp-h">
        <b>Display Columns</b>
      </div>
      <div className="cp-s">
        <svg viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          placeholder="Find columns to show/hide"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>
      <div className="cp-b">
        {!query && (
          <button type="button" className="cpr all" onClick={() => onToggleAll(!allShown)}>
            <span className={`cbx${allShown ? " on" : ""}`}>
              <svg viewBox="0 0 24 24">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </span>
            <span className="cn">All Columns</span>
            <span className="cs">
              {visibleCount} of {totalCount} shown
            </span>
          </button>
        )}
        {filtered.map((c) => {
          const checked = visibility[c.key] !== false;
          return (
            <button type="button" key={c.key} className="cpr" onClick={() => onToggle(c.key)}>
              <span className={`cbx${checked ? " on" : ""}`}>
                <svg viewBox="0 0 24 24">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
              <span className="cn">{c.label}</span>
              <span className="cs">{c.sub}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
