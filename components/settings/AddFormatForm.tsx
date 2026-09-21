"use client";

import { useState } from "react";
import { useUpsertFormatDirection } from "@/hooks/use-format-direction-mutations";
import { FORMAT_CATEGORIES, formatsByCategory } from "@/lib/formats";

export function AddFormatForm({ agencyId }: { agencyId: string }) {
  const [open, setOpen] = useState(false);
  const [formatId, setFormatId] = useState("");
  const upsert = useUpsertFormatDirection(agencyId);

  async function handleAdd() {
    if (!formatId) return;
    await upsert.mutateAsync({
      format_id: formatId,
      direction_text: null,
      caption_chars: null,
      sentences_min: null,
      sentences_max: null,
      artwork_lines: null,
      words_per_line: null,
      caps_rule: null,
    });
    setFormatId("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" className="btn sm" onClick={() => setOpen(true)}>
        + Add format
      </button>
    );
  }

  return (
    <div className="addcol">
      <select
        className="bin one"
        value={formatId}
        onChange={(e) => setFormatId(e.target.value)}
        autoFocus
      >
        <option value="" disabled>
          Choose a format…
        </option>
        {FORMAT_CATEGORIES.map((category) => (
          <optgroup key={category} label={category}>
            {formatsByCategory(category).map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <button
        type="button"
        className="btn primary sm"
        disabled={!formatId || upsert.isPending}
        onClick={handleAdd}
      >
        Add
      </button>
      <button type="button" className="btn sm" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  );
}
