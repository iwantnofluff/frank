"use client";

import { Fragment } from "react";
import { formatById, formatsLabel } from "@/lib/formats";

// A post's formats, as the line under its name (decided directly): with
// more than one, each is a button that shows the post as that platform
// draws it, the one showing marked. More than three, which wouldn't fit on
// the line, are a list to pick from. One format is just its name.
export function FormatSwitch({
  formats,
  shown,
  onShow,
  className,
}: {
  formats: string[];
  shown: string | null;
  onShow?: (format: string) => void;
  className: string;
}) {
  if (formats.length < 2 || !onShow) return <span className={className}>{formatsLabel(formats)}</span>;
  if (formats.length > 3) {
    return (
      <span className={`${className} fmtswitch many`}>
        <label>
          Show as{" "}
          <select aria-label="Show the post as" value={shown ?? formats[0]} onChange={(e) => onShow(e.target.value)}>
            {formats.map((f) => (
              <option key={f} value={f}>
                {formatById(f)?.label ?? f}
              </option>
            ))}
          </select>
        </label>
      </span>
    );
  }
  return (
    <span className={`${className} fmtswitch`} role="group" aria-label="Show the post as">
      {formats.map((f, i) => (
        <Fragment key={f}>
          {i > 0 && " + "}
          <button type="button" aria-pressed={f === shown} onClick={() => onShow(f)}>
            {formatById(f)?.label ?? f}
          </button>
        </Fragment>
      ))}
    </span>
  );
}
