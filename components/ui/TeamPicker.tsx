"use client";

// A post's Team (phase87, direct instruction: several people, not one
// Lead): who's on it as chips, in the order picked, each removable, and
// "+ Add someone" listing the rest of the team, the same pattern as a
// project's People.
export function TeamPicker({
  id,
  options,
  value,
  onChange,
  compact = false,
}: {
  id?: string;
  options: { id: string; name: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
  // In a table cell: smaller, on one line.
  compact?: boolean;
}) {
  const nameOf = (uid: string) => options.find((o) => o.id === uid)?.name ?? "Someone";
  const rest = options.filter((o) => !value.includes(o.id));
  return (
    <div className={`teampick${compact ? " compact" : ""}`}>
      {value.map((uid) => (
        <span className="tchip" key={uid}>
          {nameOf(uid)}
          <button
            type="button"
            aria-label={`Take ${nameOf(uid)} off this post`}
            onClick={() => onChange(value.filter((v) => v !== uid))}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </span>
      ))}
      {rest.length > 0 && (
        <select
          id={id}
          className={compact ? "ecell one" : "bin one"}
          aria-label="Add someone to this post's team"
          value=""
          onChange={(e) => {
            if (e.target.value) onChange([...value, e.target.value]);
          }}
        >
          <option value="">{compact ? "+ Add" : value.length ? "+ Add someone" : "Nobody yet: + Add someone"}</option>
          {rest.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
