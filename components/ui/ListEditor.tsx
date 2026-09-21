"use client";

function RemoveIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

// Shared by BriefPanel (editing an existing creative) and NewBriefModal
// (creating one) — both need the same "one textarea per item, add/remove"
// shape for Text on Image and Approach Notes.
export function ListEditor({
  label,
  itemLabel,
  values,
  onChange,
  readOnly = false,
}: {
  label: string;
  itemLabel: (index: number) => string;
  values: string[];
  onChange: (values: string[]) => void;
  // BriefPanel's client-facing view — the prototype's canEdit
  // (MODE!=="client") never gives a client an edit affordance for the
  // brief at all, so this mirrors that: same content, no add/remove, no
  // editable text.
  readOnly?: boolean;
}) {
  return (
    <div className="bsec">
      <div className="bl">{label}</div>
      {values.map((value, i) => (
        <div className="brow" key={i}>
          <b>{itemLabel(i)}</b>
          <textarea
            className="bin"
            rows={2}
            value={value}
            disabled={readOnly}
            onChange={(e) => {
              const next = [...values];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
          {!readOnly && (
            <button
              type="button"
              className="brx"
              title="Remove"
              onClick={() => onChange(values.filter((_, j) => j !== i))}
            >
              <RemoveIcon />
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <button
          type="button"
          className="badd"
          onClick={() => onChange([...values, ""])}
        >
          + Add
        </button>
      )}
    </div>
  );
}
