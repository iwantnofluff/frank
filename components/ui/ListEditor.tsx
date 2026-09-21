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
}: {
  label: string;
  itemLabel: (index: number) => string;
  values: string[];
  onChange: (values: string[]) => void;
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
            onChange={(e) => {
              const next = [...values];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
          <button
            type="button"
            className="brx"
            title="Remove"
            onClick={() => onChange(values.filter((_, j) => j !== i))}
          >
            <RemoveIcon />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="badd"
        onClick={() => onChange([...values, ""])}
      >
        + Add
      </button>
    </div>
  );
}
