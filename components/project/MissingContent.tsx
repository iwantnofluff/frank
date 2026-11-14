// An empty table cell (direct instruction): Pending where the post's
// formats call for this content and it hasn't been added; a dash where they
// don't take it at all. For the team, Pending is a small button (as the
// Status pills are) that says what it adds ("Add Creative", direct
// instruction) and opens the post's Edit window at that field; for anyone
// else, red words.
export function MissingContent({
  expected,
  onFill,
  addLabel,
}: {
  expected: boolean;
  onFill?: () => void;
  addLabel?: string;
}) {
  if (!expected) return <span className="tdim">—</span>;
  if (!onFill) return <span className="tpending">Pending</span>;
  return (
    <button
      type="button"
      className="tpending-btn"
      title={addLabel ? `Add ${addLabel} now` : "Add it now"}
      onClick={(e) => {
        // Not the row's own click, which opens the post's page.
        e.stopPropagation();
        onFill();
      }}
    >
      {addLabel ? `Add ${addLabel}` : "Pending"}
      {/* It opens somewhere: a small diagonal arrow (direct instruction). */}
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 17L17 7M9 7h8v8" />
      </svg>
    </button>
  );
}

// A filled cell's Update (direct instruction; it said Edit): "Update
// Video", "Update Caption", beside its words, the same small grey chip, with
// the Add buttons' arrow, opening the post's Edit window at that field. The
// team only: nothing for anyone else.
export function EditContent({ onFill, label }: { onFill?: () => void; label?: string }) {
  if (!onFill) return null;
  return (
    <button
      type="button"
      className="copychip tedit-btn"
      title={label ? `Update the ${label}` : "Update it"}
      onClick={(e) => {
        e.stopPropagation();
        onFill();
      }}
    >
      {label ? `Update ${label}` : "Update"}
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 17L17 7M9 7h8v8" />
      </svg>
    </button>
  );
}
