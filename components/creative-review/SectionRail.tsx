"use client";

import { ALL_SECTIONS, ICONS, type ReviewSection } from "./ReviewNav";

// A post page's sections as icons down the top-left corner of its centre
// panel (direct instruction: in place of the left column). Each name
// slides out to the right of its icon only while it's hovered or focused.
// A review link keeps its own column (ReviewNav).
export function SectionRail({
  active,
  onSelect,
}: {
  active: ReviewSection;
  onSelect: (section: ReviewSection) => void;
}) {
  return (
    <nav className="secrail" aria-label="Review sections">
      {ALL_SECTIONS.map((s) => (
        <button
          key={s.id}
          type="button"
          className="secrail-item"
          aria-current={active === s.id}
          aria-label={s.label}
          onClick={() => onSelect(s.id)}
        >
          <svg viewBox="0 0 1200 1200" aria-hidden="true">
            {ICONS[s.id]}
          </svg>
          <span className="secrail-label" aria-hidden="true">
            {s.label}
          </span>
        </button>
      ))}
    </nav>
  );
}
