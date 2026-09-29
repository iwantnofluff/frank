"use client";

export type ReviewSection = "brief" | "content" | "checks" | "feed";

const SECTIONS: { id: ReviewSection; label: string }[] = [
  { id: "brief", label: "Brief" },
  { id: "content", label: "Content" },
  { id: "checks", label: "Checks" },
  { id: "feed", label: "Feed Preview" },
];

// Chevron paths are the prototype's own (.feedrail/#fpHide,
// frank-prototype.html) — a different feature there (the Instagram grid
// panel), but the same collapse/expand glyph shape reused here for a
// different column.
export function ReviewNav({
  active,
  onSelect,
  collapsed,
  onToggleCollapsed,
}: {
  active: ReviewSection;
  onSelect: (section: ReviewSection) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  return (
    <nav className="reviewnav" aria-label="Review sections">
      <button
        type="button"
        className="reviewnav-toggle"
        onClick={onToggleCollapsed}
        title={collapsed ? "Show sections" : "Hide sections"}
      >
        <svg viewBox="0 0 24 24">
          <path d={collapsed ? "M9 18l6-6-6-6" : "M15 18l-6-6 6-6"} />
        </svg>
      </button>
      {!collapsed && (
        <div className="reviewnav-list">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className="reviewnav-item"
              aria-current={active === s.id}
              onClick={() => onSelect(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}
