import { Fragment } from "react";
import { copySummaryParts } from "@/lib/formats";

// A copy version as the tables show it (lib/formats.ts copySummaryParts):
// the caption as itself, then each other field after a blank line with
// its name in bold. Line breaks show as written (the cell's pre-wrap).
export function CopySummaryText({ fields, formatIds }: { fields: Record<string, string>; formatIds: string[] }) {
  const { caption, others } = copySummaryParts(fields, formatIds);
  return (
    <>
      {caption}
      {others.map((o, i) => (
        <Fragment key={o.label}>
          {caption || i > 0 ? "\n\n" : null}
          <b className="cc-label">{o.label}:</b> {o.text}
        </Fragment>
      ))}
    </>
  );
}
