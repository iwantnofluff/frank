import { noteBlocks } from "@/lib/notes-format";

// Notes for Designer with their headings (lib/notes-format.ts): each label
// as a small heading, its text under it, "-" lines as a list. Spans, so it
// sits inside the table's clamped cell as well as on the page.
export function NotesText({ text }: { text: string }) {
  return (
    <span className="ntext">
      {noteBlocks(text).map((b, i) =>
        b.kind === "head" ? (
          <span key={i} className="nt-h">
            {b.text}
          </span>
        ) : b.kind === "list" ? (
          <span key={i} className="nt-l">
            {b.items.map((item, j) => (
              <span key={j} className="nt-li">
                {item}
              </span>
            ))}
          </span>
        ) : (
          <span key={i} className="nt-p">
            {b.text}
          </span>
        ),
      )}
    </span>
  );
}
