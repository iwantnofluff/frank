"use client";

import { useRef } from "react";
import { useViewportFit } from "@/hooks/use-viewport-fit";

// The same hover-card shell CopyVersionHistoryPopover uses (.copypop), for
// a cell whose value has no version history of its own (Concept, Approach,
// Client Feedback) — just the complete, untruncated text, since the cell
// itself is clamped to a few lines the same way a Post Copy cell is.
export function FullTextPopover({
  lines,
  anchorRect,
  onMouseEnter,
  onMouseLeave,
}: {
  lines: string[];
  anchorRect: DOMRect;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useViewportFit(ref, anchorRect, { side: "below" });

  return (
    <div ref={ref} className="copypop on" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <div className="cp-row live">
        {lines.map((line, i) => (
          <span key={i}>{line}</span>
        ))}
      </div>
    </div>
  );
}
