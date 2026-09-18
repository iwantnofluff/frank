"use client";

import { useState } from "react";
import { useUpsertFormatDirection } from "@/hooks/use-format-direction-mutations";

export function AddFormatForm({ agencyId }: { agencyId: string }) {
  const [open, setOpen] = useState(false);
  const [formatId, setFormatId] = useState("");
  const upsert = useUpsertFormatDirection(agencyId);

  async function handleAdd() {
    if (!formatId.trim()) return;
    await upsert.mutateAsync({
      format_id: formatId.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"),
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
      <input
        className="bin one"
        placeholder="Format key, e.g. ig_feed"
        value={formatId}
        onChange={(e) => setFormatId(e.target.value)}
        autoFocus
      />
      <button
        type="button"
        className="btn primary sm"
        disabled={!formatId.trim() || upsert.isPending}
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
