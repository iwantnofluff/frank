"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CopyVersionHistoryPopover } from "@/components/project/CopyVersionHistoryPopover";

// A table cell's latest copy version (the Copy column), with its
// earlier versions on hover: the scheduled table's cell, for the
// continuous table too (direct instruction: its V1/V2 Copy became the
// real copy). Holds its own hover, so a table needs no wiring for it.
export function VersionedTextCell({ label, rows }: { label: string; rows: { versionNo: number; text: string }[] }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = rows[0];

  function show(target: HTMLElement) {
    if (timeout.current) clearTimeout(timeout.current);
    const rect = target.getBoundingClientRect();
    timeout.current = setTimeout(() => setAnchor(rect), 200);
  }
  function hide() {
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setAnchor(null), 200);
  }
  function keep() {
    if (timeout.current) clearTimeout(timeout.current);
  }

  if (!latest) return <span className="tdim">—</span>;
  return (
    <>
      <span
        className="copyc"
        onMouseEnter={(e) => rows.length > 1 && show(e.currentTarget)}
        onMouseLeave={hide}
      >
        <span className="cc-v">V{latest.versionNo}</span>
        <span className="cc-t">{latest.text}</span>
        {rows.length > 1 && <span className="cc-n">+{rows.length - 1} earlier</span>}
      </span>
      {/* Out of the table, and its clicks stop here: the row under it
          opens the post (React events bubble through a portal too). */}
      {anchor &&
        createPortal(
          <div onClick={(e) => e.stopPropagation()}>
            <CopyVersionHistoryPopover label={label} rows={rows} anchorRect={anchor} onMouseEnter={keep} onMouseLeave={hide} />
          </div>,
          document.body,
        )}
    </>
  );
}
