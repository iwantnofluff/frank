"use client";

import { useRef } from "react";
import { useViewportFit } from "@/hooks/use-viewport-fit";

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
  const ref = useRef<HTMLDivElement>(null);
  useViewportFit(ref, anchorRect, { side: "below" });

  return (
    <div ref={ref} className="copypop on" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
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
