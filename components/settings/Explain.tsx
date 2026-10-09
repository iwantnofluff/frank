"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { EXPLAIN, type ExplainKey } from "@/lib/analytics-explain";

// A number on Analytics, explained on hover or focus (direct instruction):
// what it is, and why it matters. Drawn in a layer over the page, placed
// from the number's own position, so a scrolling table can't clip it.
export function Explain({
  k,
  title,
  children,
  className,
  as: Tag = "div",
}: {
  k: ExplainKey;
  title: string;
  children: ReactNode;
  className?: string;
  as?: "div" | "th" | "span";
}) {
  const [at, setAt] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const e = EXPLAIN[k];
  const width = 300;

  function show(el: HTMLElement) {
    const r = el.getBoundingClientRect();
    const left = Math.min(Math.max(12, r.left + r.width / 2 - width / 2), window.innerWidth - width - 12);
    // Below the number, unless that runs off the screen.
    const above = r.bottom + 190 > window.innerHeight;
    setAt({ left, top: above ? r.top - 8 : r.bottom + 8, above });
  }

  return (
    <Tag
      className={`${className ?? ""} an-explain`.trim()}
      tabIndex={0}
      aria-describedby={at ? `an-tip-${k}` : undefined}
      onMouseEnter={(ev) => show(ev.currentTarget)}
      onMouseLeave={() => setAt(null)}
      onFocus={(ev) => show(ev.currentTarget)}
      onBlur={() => setAt(null)}
    >
      {children}
      {at &&
        createPortal(
          <div
            id={`an-tip-${k}`}
            role="tooltip"
            className={`an-tip${at.above ? " above" : ""}`}
            style={{ left: at.left, top: at.top, width }}
          >
            <b>{title}</b>
            <p>{e.what}</p>
            <p className="why">
              <span>Why it matters</span>
              {e.why}
            </p>
          </div>,
          document.body,
        )}
    </Tag>
  );
}
