"use client";

function RemoveIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

// Shared by BriefPanel (editing an existing creative) and CreativeModal's
// Brief tab — both need the same "one textarea per item, add/remove" shape
// for Text on Image.
export function ListEditor({
  label,
  itemLabel,
  values,
  onChange,
  readOnly = false,
  bare = false,
}: {
  // Optional — when the caller already has its own heading for this list
  // (CreativeModal's Brief tab renders a real .msection-h/.msection-d pair
  // above it now), pass nothing and set bare instead of duplicating it here.
  label?: string;
  itemLabel: (index: number) => string;
  values: string[];
  onChange: (values: string[]) => void;
  // BriefPanel's client-facing view — the prototype's canEdit
  // (MODE!=="client") never gives a client an edit affordance for the
  // brief at all, so this mirrors that: same content, no add/remove, no
  // editable text.
  readOnly?: boolean;
  // Skips the .bsec wrapper (its own padding/border-bottom) so this sits
  // as plain content under an external section heading instead of reading
  // as a second, nested box.
  bare?: boolean;
}) {
  const items = (
    <>
      {values.map((value, i) => (
        <div className="brow" key={i}>
          <div className="brow-h">
            <b>{itemLabel(i)}</b>
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
    </>
  );

  if (bare) return <div className="field">{items}</div>;

  return (
    <div className="bsec">
      {label && <div className="bl">{label}</div>}
      {items}
    </div>
  );
}
