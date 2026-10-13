"use client";

import { useState } from "react";
import { COLUMN_TYPE_OPTIONS, type CustomColumnOption, type CustomColumnType } from "@/hooks/use-custom-columns";
import { parseOptions } from "@/hooks/use-create-custom-column";
import { errorMessage } from "@/lib/errors";

export interface ColumnSpec {
  label: string;
  type: CustomColumnType;
  options: CustomColumnOption[] | null;
}

// Adding a project's own column (phase96, direct instruction): its name and
// what it records. The table's Columns picker saves it at once; a new
// project's Columns step keeps it until the project is made.
export function AddColumnForm({ onAdd }: { onAdd: (column: ColumnSpec) => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<CustomColumnType>("text");
  const [optionsText, setOptionsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = type === "dropdown" ? parseOptions(optionsText) : null;
  const ready = !!label.trim() && (type !== "dropdown" || (options?.length ?? 0) > 0);

  function reset() {
    setLabel("");
    setType("text");
    setOptionsText("");
    setError(null);
    setOpen(false);
  }

  async function add() {
    if (!ready) return;
    setSaving(true);
    setError(null);
    try {
      await onAdd({ label: label.trim(), type, options });
      reset();
    } catch (e) {
      setError(errorMessage(e, "Couldn't add the column"));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="fbtn addcol-open" onClick={() => setOpen(true)}>
        + Add Column
      </button>
    );
  }

  return (
    <div className="addcol">
      <input
        className="bin one"
        aria-label="Column name"
        placeholder="Column name, e.g. Thumbnail Text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void add();
        }}
        autoFocus
      />
      <select
        className="bin one"
        aria-label="What it records"
        value={type}
        onChange={(e) => setType(e.target.value as CustomColumnType)}
      >
        {COLUMN_TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {type === "dropdown" && (
        <input
          className="bin one"
          aria-label="Options"
          placeholder="Options, separated by commas"
          value={optionsText}
          onChange={(e) => setOptionsText(e.target.value)}
        />
      )}
      <div className="addcol-f">
        <button type="button" className="btn sm" onClick={reset}>
          Cancel
        </button>
        <button type="button" className="btn primary sm" disabled={!ready || saving} onClick={() => void add()}>
          {saving ? "Adding…" : "Add"}
        </button>
      </div>
      {error && <p className="autherr">{error}</p>}
    </div>
  );
}
