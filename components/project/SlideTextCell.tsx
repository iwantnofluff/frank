// The table's Text on Image (direct instruction): on a post with several
// slides, each slide's words under its own heading (Slide 1, Slide 2, in
// NotesText's small capitals), so it's clear which words go where; on a
// single image, just the words.
export function SlideTextCell({ texts, multi }: { texts: string[]; multi: boolean }) {
  if (!multi) return <>{texts.filter((t) => t.trim()).join("\n")}</>;
  return (
    <span className="ntext">
      {texts.map((t, i) =>
        t.trim() ? (
          <span key={i}>
            <span className="nt-h">Slide {i + 1}</span>
            <span className="nt-p">{t}</span>
          </span>
        ) : null,
      )}
    </span>
  );
}
