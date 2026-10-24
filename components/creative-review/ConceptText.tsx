import { conceptBlocks } from "@/lib/concept-format";

// A Concept laid out for reading (lib/concept-format.ts): paragraphs, and
// each slide on its own line with its label.
export function ConceptText({ text }: { text: string }) {
  return (
    <span className="ctext">
      {conceptBlocks(text).map((b, i) =>
        b.kind === "slide" ? (
          <span key={i} className="ctext-s">
            <b>{b.label}:</b> {b.text}
          </span>
        ) : (
          <span key={i} className="ctext-p">
            {b.text}
          </span>
        ),
      )}
    </span>
  );
}
