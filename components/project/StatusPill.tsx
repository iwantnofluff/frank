"use client";

import type { CSSProperties } from "react";
import type { StatusOption } from "@/lib/project-statuses";

// A stage pill that is its status's dropdown (phase123, direct
// instruction): it reads "3b. Internal QC (Creative)" and picks another of
// its stage's statuses, or the stage alone ("3. Internal", phase124), which
// leads the list. Native, so the keyboard and screen readers work as
// they do with any dropdown. The team's only; others see the plain pill.
export function StatusPill({
  stageText,
  options,
  value,
  onPick,
  disabled,
  className,
  style,
}: {
  // The stage alone, first in the list ("3. Internal").
  stageText: string;
  options: StatusOption[];
  value: string | null;
  onPick: (statusId: string | null) => void;
  disabled?: boolean;
  className: string;
  style?: CSSProperties;
}) {
  return (
    <select
      className={className}
      style={style}
      aria-label="Status within the stage"
      value={value ?? ""}
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onPick(e.target.value || null)}
    >
      <option value="">{stageText}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.text}
        </option>
      ))}
    </select>
  );
}
