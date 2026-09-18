"use client";

import { useState } from "react";
import type { CustomColumnOption, CustomColumnType } from "@/hooks/use-custom-columns";
import { useCreateCustomColumn } from "@/hooks/use-create-custom-column";

const TYPE_LABELS: Record<CustomColumnType, string> = {
  text: "Text",
  number: "Number",
  checkbox: "Checkbox",
  dropdown: "Dropdown",
  status: "Status",
};

const STATUS_COLOURS = [
  "#007BFF",
  "#2BB65B",
  "#FF8A00",
  "#FF0000",
  "#6B7280",
];

export function AddColumnForm({
  projectId,
  nextPosition,
}: {
  projectId: string;
  nextPosition: number;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<CustomColumnType>("text");
  const [optionsText, setOptionsText] = useState("");

  const createColumn = useCreateCustomColumn(projectId);
  const needsOptions = type === "dropdown" || type === "status";

  function reset() {
    setLabel("");
    setType("text");
    setOptionsText("");
    setOpen(false);
  }

  async function handleSubmit() {
    if (!label.trim()) return;

    let options: CustomColumnOption[] | null = null;
    if (needsOptions) {
      options = optionsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s, i) => ({
          value: s.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
          label: s,
          colour: type === "status" ? STATUS_COLOURS[i % STATUS_COLOURS.length] : undefined,
        }));
    }

    await createColumn.mutateAsync({ label: label.trim(), type, options, position: nextPosition });
    reset();
  }

  if (!open) {
    return (
      <button type="button" className="btn sm" onClick={() => setOpen(true)}>
        + Add column
      </button>
    );
  }

  return (
    <div className="addcol">
      <input
        className="bin one"
        placeholder="Column name"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        autoFocus
      />
      <select
        className="bin one"
        value={type}
        onChange={(e) => setType(e.target.value as CustomColumnType)}
      >
        {Object.entries(TYPE_LABELS).map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
      {needsOptions && (
        <input
          className="bin one"
          placeholder="Options, comma separated"
          value={optionsText}
          onChange={(e) => setOptionsText(e.target.value)}
        />
      )}
      <button
        type="button"
        className="btn primary sm"
        disabled={!label.trim() || createColumn.isPending}
        onClick={handleSubmit}
      >
        Add
      </button>
      <button type="button" className="btn sm" onClick={reset}>
        Cancel
      </button>
    </div>
  );
}
