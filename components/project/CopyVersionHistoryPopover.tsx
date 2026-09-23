"use client";

import type { CSSProperties } from "react";

export interface CopyHistoryRow {
  versionNo: number;
  text: string;
}

// Ports frank-prototype.html's `.copypop`/`.cp-row` — a hover card listing
// a cell's older values, newest first, the current one marked "Latest".
// The prototype's own copyCell() uses this shape for a static list of
// candidate captions ("Copy Options", a schema concept this app doesn't
// have — docs/parity-gaps.md); here it holds real copy_versions rows
// instead, which is what "the different versions" means in this schema.
export function CopyVersionHistoryPopover({
  label,
  rows,
  anchorRect,
  onMouseEnter,
  onMouseLeave,
}: {
  label: string;
  rows: CopyHistoryRow[];
  anchorRect: DOMRect;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const style: CSSProperties = (() => {
    const pw = 380;
    const ph = 260;
    let left = anchorRect.left;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    if (left < 8) left = 8;
    let top = anchorRect.bottom + 6;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, anchorRect.top - ph - 6);
    return { left, top };
  })();

  return (
    <div className="copypop on" style={style} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      {rows.length === 0 ? (
        <div className="cp-row">
          <span className="tdim">No {label.toLowerCase()} yet</span>
        </div>
      ) : (
        rows.map((row, i) => (
          <div className={`cp-row${i === 0 ? " live" : ""}`} key={row.versionNo}>
            <b>
              V{row.versionNo}
              {i === 0 ? " · Latest" : ""}
            </b>
            <span>{row.text}</span>
          </div>
        ))
      )}
    </div>
  );
}
