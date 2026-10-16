// An empty table cell (direct instruction): Pending where the post's
// formats call for this content and it hasn't been added; a dash where they
// don't take it at all. For the team, Pending is a small button (as the
// Status pills are) that opens the post's Edit window at that field; for
// anyone else, red words.
export function MissingContent({ expected, onFill }: { expected: boolean; onFill?: () => void }) {
  if (!expected) return <span className="tdim">—</span>;
  if (!onFill) return <span className="tpending">Pending</span>;
  return (
    <button
      type="button"
      className="tpending-btn"
      title="Add it now"
      onClick={(e) => {
        // Not the row's own click, which opens the post's page.
        e.stopPropagation();
        onFill();
      }}
    >
      Pending
    </button>
  );
}
