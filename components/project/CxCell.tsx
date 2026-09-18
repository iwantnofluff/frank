"use client";

import { useState } from "react";
import type { CustomColumnRow } from "@/hooks/use-custom-columns";

export function CxCell({
  column,
  value,
  onSave,
}: {
  column: CustomColumnRow;
  value: string | number | boolean | null;
  onSave: (value: string | number | boolean | null) => void;
}) {
  const [draft, setDraft] = useState(
    value === null || value === undefined ? "" : String(value),
  );

  // Stop the row's own onClick (navigate-to-creative) from firing when
  // interacting with a cell's controls.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  if (column.type === "checkbox") {
    return (
      <div onClick={stop}>
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onSave(e.target.checked)}
        />
      </div>
    );
  }

  if (column.type === "number") {
    return (
      <div onClick={stop}>
        <input
          className="cxin"
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onSave(draft === "" ? null : Number(draft))}
        />
      </div>
    );
  }

  if (column.type === "dropdown" || column.type === "status") {
    const options = column.options ?? [];
    const selected = options.find((o) => o.value === value);
    return (
      <div onClick={stop}>
        <select
          className="cxin"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onSave(e.target.value || null)}
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {column.type === "status" && selected && (
          <span
            className="tag"
            style={{
              marginLeft: 6,
              background: selected.colour ? `${selected.colour}22` : "var(--blue-bg)",
              color: selected.colour ?? "var(--blue)",
            }}
          >
            {selected.label}
          </span>
        )}
      </div>
    );
  }

  return (
    <div onClick={stop}>
      <input
        className="cxin"
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onSave(draft || null)}
      />
    </div>
  );
}
