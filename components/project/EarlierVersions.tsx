"use client";

import { useRef, useState, type ReactNode } from "react";
import { CopyVersionHistoryPopover } from "@/components/project/CopyVersionHistoryPopover";

// "+N earlier" under a versioned cell (the Caption column's, direct
// instruction), opening every version, the latest first, on hover. Used
// for Notes for Designer's look-alikes: the VO and Text on Image (phase120).
export function EarlierVersions({
  label,
  rows,
}: {
  label: string;
  // Newest first.
  rows: { versionNo: number; text: string; node?: ReactNode }[];
}) {
  const [hover, setHover] = useState<DOMRect | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const later = (fn: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fn, 200);
  };
  if (rows.length < 2) return null;
  return (
    <>
      <span
        className="cc-n"
        onMouseEnter={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          later(() => setHover(rect));
        }}
        onMouseLeave={() => later(() => setHover(null))}
      >
        +{rows.length - 1} earlier
      </span>
      {hover && (
        <CopyVersionHistoryPopover
          label={label}
          rows={rows}
          anchorRect={hover}
          onMouseEnter={() => timer.current && clearTimeout(timer.current)}
          onMouseLeave={() => later(() => setHover(null))}
        />
      )}
    </>
  );
}
