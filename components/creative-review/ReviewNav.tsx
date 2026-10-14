"use client";

import type { ReactNode } from "react";
import { usePresence } from "@/hooks/use-presence";

export type ReviewSection = "brief" | "content" | "checks" | "feed";

// Each section's icon, supplied directly (Brief.svg, Content.svg,
// Check.svg, Grid.svg): filled shapes on a 1200 grid, Checks drawn as
// lines of the same weight.
export const ICONS: Record<ReviewSection, ReactNode> = {
  brief: (
    <>
      <path d="m1139.1 37.5h-1078.1c-12.941 0-23.438 10.492-23.438 23.438v1078.1c0 12.941 10.496 23.438 23.438 23.438h1078.1c12.945 0 23.438-10.496 23.438-23.438v-1078.1c0-12.945-10.492-23.438-23.438-23.438zm-23.438 1078.1h-1031.2v-1031.2h1031.2z" />
      <path d="m201.56 318.75h820.31c12.945 0 23.438-10.492 23.438-23.438s-10.492-23.438-23.438-23.438h-820.31c-12.941 0-23.438 10.492-23.438 23.438s10.496 23.438 23.438 23.438z" />
      <path d="m201.56 623.44h820.31c12.945 0 23.438-10.496 23.438-23.438 0-12.945-10.492-23.438-23.438-23.438h-820.31c-12.941 0-23.438 10.492-23.438 23.438 0 12.941 10.496 23.438 23.438 23.438z" />
      <path d="m201.56 928.12h820.31c12.945 0 23.438-10.496 23.438-23.438s-10.492-23.438-23.438-23.438h-820.31c-12.941 0-23.438 10.496-23.438 23.438s10.496 23.438 23.438 23.438z" />
    </>
  ),
  content: (
    <path d="m1139.1 37.5h-1078.1c-12.941 0-23.438 10.492-23.438 23.438v1078.1c0 12.941 10.496 23.438 23.438 23.438h1078.1c12.945 0 23.438-10.496 23.438-23.438v-1078.1c0-12.945-10.492-23.438-23.438-23.438zm-1054.7 46.875h1031.2v187.5h-1031.2zm0 1031.2v-796.88h1031.2v796.88z" />
  ),
  checks: (
    // A box with a tick through its open corner (Noun Project, "Check"
    // 3835759, supplied directly), redrawn as lines on the others' box
    // and line weight (.ic-line) so it matches them.
    <>
      <path className="ic-line" d="M890.3 60.94H60.94V1139.06H1139.06V517.1" />
      <path className="ic-line" d="M309.7 600L517.1 807.3L1097.6 226.8" />
    </>
  ),
  feed: (
    <>
      <path d="m295.31 37.5h-234.38c-12.941 0-23.438 10.492-23.438 23.438v234.38c0 12.945 10.496 23.438 23.438 23.438h234.38c12.945 0 23.438-10.492 23.438-23.438v-234.38c0-12.945-10.492-23.438-23.438-23.438zm-23.438 234.38h-187.5v-187.5h187.5z" />
      <path d="m717.19 37.5h-234.38c-12.941 0-23.438 10.492-23.438 23.438v234.38c0 12.945 10.496 23.438 23.438 23.438h234.38c12.945 0 23.438-10.492 23.438-23.438v-234.38c0-12.945-10.492-23.438-23.438-23.438zm-23.438 234.38h-187.5v-187.5h187.5z" />
      <path d="m1139.1 37.5h-234.38c-12.941 0-23.438 10.492-23.438 23.438v234.38c0 12.945 10.496 23.438 23.438 23.438h234.38c12.945 0 23.438-10.492 23.438-23.438v-234.38c0-12.945-10.492-23.438-23.438-23.438zm-23.438 234.38h-187.5v-187.5h187.5z" />
      <path d="m295.31 459.38h-234.38c-12.941 0-23.438 10.492-23.438 23.438v234.38c0 12.941 10.496 23.438 23.438 23.438h234.38c12.945 0 23.438-10.496 23.438-23.438v-234.38c0-12.945-10.492-23.438-23.438-23.438zm-23.438 234.38h-187.5v-187.5h187.5z" />
      <path d="m717.19 459.38h-234.38c-12.941 0-23.438 10.492-23.438 23.438v234.38c0 12.941 10.496 23.438 23.438 23.438h234.38c12.945 0 23.438-10.496 23.438-23.438v-234.38c0-12.945-10.492-23.438-23.438-23.438zm-23.438 234.38h-187.5v-187.5h187.5z" />
      <path d="m1139.1 459.38h-234.38c-12.941 0-23.438 10.492-23.438 23.438v234.38c0 12.941 10.496 23.438 23.438 23.438h234.38c12.945 0 23.438-10.496 23.438-23.438v-234.38c0-12.945-10.492-23.438-23.438-23.438zm-23.438 234.38h-187.5v-187.5h187.5z" />
      <path d="m295.31 881.25h-234.38c-12.941 0-23.438 10.496-23.438 23.438v234.38c0 12.941 10.496 23.438 23.438 23.438h234.38c12.945 0 23.438-10.496 23.438-23.438v-234.38c0-12.941-10.492-23.438-23.438-23.438zm-23.438 234.38h-187.5v-187.5h187.5z" />
      <path d="m717.19 881.25h-234.38c-12.941 0-23.438 10.496-23.438 23.438v234.38c0 12.941 10.496 23.438 23.438 23.438h234.38c12.945 0 23.438-10.496 23.438-23.438v-234.38c0-12.941-10.492-23.438-23.438-23.438zm-23.438 234.38h-187.5v-187.5h187.5z" />
      <path d="m1139.1 881.25h-234.38c-12.941 0-23.438 10.496-23.438 23.438v234.38c0 12.941 10.496 23.438 23.438 23.438h234.38c12.945 0 23.438-10.496 23.438-23.438v-234.38c0-12.941-10.492-23.438-23.438-23.438zm-23.438 234.38h-187.5v-187.5h187.5z" />
    </>
  ),
};

export const ALL_SECTIONS: { id: ReviewSection; label: string }[] = [
  { id: "brief", label: "Brief" },
  { id: "content", label: "Content" },
  { id: "checks", label: "Checks" },
  { id: "feed", label: "Feed" },
];

// The review page's sections (direct instruction): icons only when
// closed, icon and name when open, the column as wide as the longest name
// plus 20px. The names ease in when it opens and out, faster, when it
// closes (hooks/use-presence.ts); the column itself snaps, since only
// opacity and transform animate. Chevron paths are the prototype's own
// (.feedrail/#fpHide, frank-prototype.html).
// A review link shows only Content and Feed (direct instruction).
export function ReviewNav({
  active,
  onSelect,
  collapsed,
  onToggleCollapsed,
  sections = ALL_SECTIONS,
}: {
  active: ReviewSection;
  onSelect: (section: ReviewSection) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  sections?: { id: ReviewSection; label: string }[];
}) {
  const names = usePresence(!collapsed);
  return (
    <nav className={`reviewnav${names.shown ? " named" : ""}`} aria-label="Review sections">
      <button
        type="button"
        className="reviewnav-toggle"
        onClick={onToggleCollapsed}
        title={collapsed ? "Show section names" : "Hide section names"}
        aria-expanded={!collapsed}
      >
        <svg viewBox="0 0 24 24">
          <path d={collapsed ? "M9 18l6-6-6-6" : "M15 18l-6-6 6-6"} />
        </svg>
      </button>
      <div className="reviewnav-list">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            className="reviewnav-item"
            aria-current={active === s.id}
            aria-label={s.label}
            title={collapsed ? s.label : undefined}
            onClick={() => onSelect(s.id)}
          >
            <svg className="rn-ic" viewBox="0 0 1200 1200" aria-hidden="true">
              {ICONS[s.id]}
            </svg>
            {names.shown && (
              <span className={`rn-label${names.isOpen ? " is-open" : ""}`}>{s.label}</span>
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}
