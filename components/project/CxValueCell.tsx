"use client";

import type { CustomColumnRow } from "@/hooks/use-custom-columns";
import { ClampText } from "@/components/project/ClampText";
import { EditContent, MissingContent } from "@/components/project/MissingContent";

// A project field's value in a table cell, never edited in place (direct
// instruction): the value, then Edit with its arrow for the team, which
// opens the post's window at that field; empty, an Add button for the team
// and a dash for anyone else. Notes for Designer and Principles use it too.
export function CxValueCell({
  column,
  value,
  expanded,
  onToggle,
  onFill,
  after,
  addLabel,
}: {
  column: Pick<CustomColumnRow, "label" | "type" | "options">;
  value: string | number | boolean | null | undefined;
  // Its row's Read more (ClampText).
  expanded: boolean;
  onToggle: () => void;
  // The team's Edit or Add: the post's window at this field.
  onFill?: () => void;
  // More under the value (each image's own note under Notes for Designer).
  after?: React.ReactNode;
  // What its Add button says, when shorter than the column's name.
  addLabel?: string;
}) {
  const shown = (() => {
    if (value === null || value === undefined || value === "") return null;
    if (column.type === "checkbox") return value === true ? "Yes" : null;
    if (column.type === "date" && typeof value === "string") {
      const d = new Date(`${value}T00:00:00`);
      return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
    }
    if (column.type === "dropdown" || column.type === "status") {
      return (column.options ?? []).find((o) => o.value === value)?.label ?? String(value);
    }
    return String(value).trim() || null;
  })();

  if (!shown && !after) {
    return onFill ? <MissingContent expected onFill={onFill} addLabel={addLabel ?? column.label} /> : <span className="tdim">—</span>;
  }
  const selected = column.type === "status" ? (column.options ?? []).find((o) => o.value === value) : undefined;
  return (
    <span className="copyc">
      {shown && (
        <ClampText expanded={expanded} onToggle={onToggle} after={<EditContent onFill={onFill} label={column.label} />}>
          {selected ? (
            <span
              className="tag"
              style={{ background: selected.colour ? `${selected.colour}22` : "var(--blue-bg)", color: selected.colour ?? "var(--blue)" }}
            >
              {shown}
            </span>
          ) : (
            shown
          )}
        </ClampText>
      )}
      {after}
      {!shown && <EditContent onFill={onFill} label={column.label} />}
    </span>
  );
}
