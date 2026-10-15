// An empty table cell (direct instruction): Pending, in red, where the
// post's formats call for this content and it hasn't been added; a dash
// where they don't take it at all.
export function MissingContent({ expected }: { expected: boolean }) {
  return expected ? <span className="tpending">Pending</span> : <span className="tdim">—</span>;
}
