"use client";

import { useState } from "react";

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

// Shared by BriefPanel, and the Content/Checks sections on the creative
// review page — same collapsible box (.brief/.bf-h/.bf-b), three call
// sites instead of one now that the page mirrors the Edit modal's own
// Brief/Content/Checks split.
export function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`brief${open ? " open" : ""}`}>
      <button
        type="button"
        className="bf-h"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <b>{title}</b>
        <ChevronIcon />
      </button>
      {open && <div className="bf-b">{children}</div>}
    </div>
  );
}
