"use client";

import { useState } from "react";

export interface EditorColumn {
  key: string;
  label: string;
  // What it records, shown, not editable.
  typeLabel: string;
}

// The columns of a project's table, to choose and arrange (direct
// instruction), in the New Project window's Columns step and the table's
// Columns picker alike: drag a row to move it, tick to show it, rename it
// (when allowed), and, for one added in the New Project window and not
// yet saved, take it out again.
export function ColumnEditor({
  columns,
  hidden,
  onToggle,
  onReorder,
  onRename,
  onRemove,
}: {
  columns: EditorColumn[];
  hidden: Set<string>;
  onToggle: (key: string) => void;
  onReorder: (keys: string[]) => void;
  // Absent: names can't be changed here.
  onRename?: (key: string, label: string) => void;
  // Only for columns that can be taken out (canRemove).
  onRemove?: (key: string) => void;
}) {
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  function drop(target: string) {
    if (!dragKey || dragKey === target) return;
    const keys = columns.map((c) => c.key);
    const from = keys.indexOf(dragKey);
    const to = keys.indexOf(target);
    keys.splice(from, 1);
    keys.splice(to, 0, dragKey);
    onReorder(keys);
  }

  return (
    <div className="coled" role="group" aria-label="Columns">
      {columns.map((c) => (
        <div
          key={c.key}
          className={`coled-row${dragKey === c.key ? " dragging" : ""}${overKey === c.key && dragKey !== c.key ? " over" : ""}`}
          draggable
          onDragStart={(e) => {
            setDragKey(c.key);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setOverKey(c.key);
          }}
          onDragLeave={() => setOverKey((k) => (k === c.key ? null : k))}
          onDrop={(e) => {
            e.preventDefault();
            drop(c.key);
            setDragKey(null);
            setOverKey(null);
          }}
          onDragEnd={() => {
            setDragKey(null);
            setOverKey(null);
          }}
        >
          <span className="coled-grip" aria-hidden="true" title="Drag to move">
            <svg viewBox="0 0 24 24">
              <circle cx="9" cy="6" r="1.4" />
              <circle cx="15" cy="6" r="1.4" />
              <circle cx="9" cy="12" r="1.4" />
              <circle cx="15" cy="12" r="1.4" />
              <circle cx="9" cy="18" r="1.4" />
              <circle cx="15" cy="18" r="1.4" />
            </svg>
          </span>
          <input
            type="checkbox"
            aria-label={`Show ${c.label}`}
            checked={!hidden.has(c.key)}
            onChange={() => onToggle(c.key)}
          />
          {onRename ? (
            <NameField label={c.label} onRename={(label) => onRename(c.key, label)} />
          ) : (
            <span className="coled-name">{c.label}</span>
          )}
          <span className="coled-type">{c.typeLabel}</span>
          {onRemove && c.key.startsWith("new:") && (
            <button type="button" className="coled-x" aria-label={`Remove ${c.label}`} onClick={() => onRemove(c.key)}>
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// A column's name, editable in place: saved when left or on Enter, put
// back on Escape or if emptied.
function NameField({ label, onRename }: { label: string; onRename: (label: string) => void }) {
  const [draft, setDraft] = useState(label);
  const [was, setWas] = useState(label);
  if (label !== was) {
    setWas(label);
    setDraft(label);
  }
  return (
    <input
      className="coled-name coled-name-in"
      aria-label={`Name of ${label}`}
      value={draft}
      maxLength={40}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = draft.trim();
        if (!next) setDraft(label);
        else if (next !== label) onRename(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          // Puts the name back without closing the Columns picker too.
          e.stopPropagation();
          setDraft(label);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
