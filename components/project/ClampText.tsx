"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

// A table cell's text, at most two lines (direct instruction), with "Read
// more" when there's more. Expanding is per row: the table holds which row
// is open, so opening one cell opens that row's others and closes any
// other row. Clicks stop here: the row under it opens the post.
export function ClampText({
  expanded,
  onToggle,
  children,
  after,
}: {
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  // Shown at the end of the text once all of it is in view: straight away
  // when it fits, after Read more when it doesn't (the Copy column's Copy
  // Caption, direct instruction).
  after?: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);

  // Whether the clamped text hides any lines; measured only while clamped,
  // and again when the cell is resized (a column dragged wider).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, children]);

  return (
    <>
      <span ref={ref} className={`cc-t${expanded ? " open" : ""}`}>
        {children}
      </span>
      {after && (!overflows || expanded) && <span className="cc-after">{after}</span>}
      {(overflows || expanded) && (
        <button
          type="button"
          className="readmore"
          aria-expanded={expanded}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          {expanded ? "Read less" : "Read more"}
        </button>
      )}
    </>
  );
}
