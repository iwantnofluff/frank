"use client";

import { useEffect, useRef, useState } from "react";
import { usePresence } from "@/hooks/use-presence";
import { useViewportFit } from "@/hooks/use-viewport-fit";
import { FORMAT_CATEGORIES, formatsByCategory, formatsLabel } from "@/lib/formats";

// The New/Edit Post window's Format field: tick any number of formats, from
// any content type. Replaces the prototype's Content Type + Format selects
// (one format each) — docs/parity-gaps.md. The same .colpop shell and
// .cpr/.cbx rows as the table's Display Columns picker.
//
// Order is the order ticked, and the first one is the main format (Feed
// Preview shape). At least one always stays ticked.
export function FormatPicker({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  // Opens and closes with motion (hooks/use-presence.ts).
  const pop = usePresence(anchor);
  const [query, setQuery] = useState("");
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
      // Closes the picker, not the whole post window behind it.
      if (e.key === "Escape") {
        e.stopPropagation();
        setAnchor(null);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [anchor]);

  function toggle(fid: string) {
    if (value.includes(fid)) {
      if (value.length > 1) onChange(value.filter((x) => x !== fid));
    } else {
      onChange([...value, fid]);
    }
  }

  const q = query.trim().toLowerCase();

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="fmtpick"
        aria-haspopup="dialog"
        aria-expanded={!!anchor}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setQuery("");
          setAnchor((prev) => (prev ? null : rect));
        }}
      >
        {formatsLabel(value)}
      </button>
      {pop.shown && (
        <div className={`colpop on fmtpop motion${pop.isOpen ? " is-open" : ""}`} ref={ref} role="dialog" aria-label="Formats" style={{ width: Math.max(pop.shown.width, 330) }}>
          <div className="cp-h">
            <b>Formats</b>
            <span className="cs">{value.length} chosen</span>
          </div>
          <div className="cp-s">
            <svg viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input placeholder="Find a format" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          </div>
          <div className="cp-b">
            {FORMAT_CATEGORIES.map((cat) => {
              const rows = formatsByCategory(cat).filter((f) => !q || f.label.toLowerCase().includes(q));
              if (!rows.length) return null;
              return (
                <div key={cat} role="group" aria-label={cat}>
                  <div className="fmtpop-cat">{cat}</div>
                  {rows.map((f) => {
                    const on = value.includes(f.id);
                    return (
                      <button
                        type="button"
                        key={f.id}
                        className="cpr"
                        role="checkbox"
                        aria-checked={on}
                        aria-label={f.label}
                        aria-description={value[0] === f.id && value.length > 1 ? "Main format" : undefined}
                        onClick={() => toggle(f.id)}
                      >
                        <span className={`cbx${on ? " on" : ""}`}>
                          <svg viewBox="0 0 24 24">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        </span>
                        <span className="cn">{f.label}</span>
                        {value[0] === f.id && value.length > 1 && <span className="cs">Main</span>}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
