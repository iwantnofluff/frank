import { Fragment } from "react";
import { copySummaryParts } from "@/lib/formats";

// A copy version as the tables show it (lib/formats.ts copySummary): each
// field the post's formats use, with no field names (direct instruction),
// each starting a line even in the closed cell, which runs a field's own
// line breaks together; open, a blank line apart, line breaks as written
// (the cell's pre-line).
export function CopySummaryText({ fields, formatIds }: { fields: Record<string, string>; formatIds: string[] }) {
  const { caption, others } = copySummaryParts(fields, formatIds);
  const parts = [caption, ...others.map((o) => o.text)].filter((t): t is string => !!t);
  return (
    <>
      {parts.map((text, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <>
              <br />
              {"\n"}
            </>
          )}
          {text}
        </Fragment>
      ))}
    </>
  );
}
