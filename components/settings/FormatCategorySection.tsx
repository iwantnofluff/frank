"use client";

import { useState } from "react";
import type { FormatDefinition } from "@/lib/formats";
import type { FormatDirectionRow as FormatDirectionRecord } from "@/hooks/use-format-directions";
import { FormatDirectionRow } from "@/components/settings/FormatDirectionRow";

// Ports the prototype's fd-cat/fd-body collapse (frank-prototype.html,
// renderMethod()) — only the first category defaults open (its own FD_OPEN
// seed: `Object.keys(FORMATS).forEach((c,i)=>FD_OPEN[c]=i===0)`), every
// other category, including General, starts closed.
export function FormatCategorySection({
  agencyId,
  category,
  formats,
  recordsById,
  defaultOpen,
}: {
  agencyId: string;
  category: string;
  formats: FormatDefinition[];
  recordsById: Map<string, FormatDirectionRecord>;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <>
      <div
        className={`fd-cat${open ? " open" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((o) => !o);
        }}
      >
        <svg viewBox="0 0 24 24">
          <path d="M9 18l6-6-6-6" />
        </svg>
        <b>{category}</b>
        <span>
          {formats.length} format{formats.length > 1 ? "s" : ""}
        </span>
      </div>
      <div className="fd-body" style={{ display: open ? "block" : "none" }}>
        {formats.map((format) => (
          <FormatDirectionRow
            key={format.id}
            agencyId={agencyId}
            format={format}
            record={recordsById.get(format.id)}
          />
        ))}
      </div>
    </>
  );
}
