"use client";

import type { ReactNode } from "react";
import { usePresence } from "@/hooks/use-presence";

export type ReviewSection = "brief" | "content" | "checks" | "feed";

// Each section's icon, supplied directly (Brief.svg, Content.svg,
// Check.svg, Grid.svg): filled shapes on a 1200 grid.
const ICONS: Record<ReviewSection, ReactNode> = {
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
    <>
      <path d="m1079.7 37.5h-959.38c-45.66 0-82.812 37.152-82.812 82.812v959.38c0 45.66 37.152 82.812 82.812 82.812h959.38c45.664 0 82.812-37.152 82.812-82.812v-959.38c0-45.66-37.148-82.812-82.809-82.812zm35.934 1042.2c0 19.816-16.121 35.938-35.934 35.938h-959.38c-19.816 0-35.938-16.121-35.938-35.938v-959.38c0-19.816 16.121-35.938 35.938-35.938h959.38c19.816 0 35.938 16.121 35.938 35.938z" />
      <path d="m600 201.56c-219.7 0-398.44 178.74-398.44 398.44s178.74 398.44 398.44 398.44 398.44-178.74 398.44-398.44-178.74-398.44-398.44-398.44zm0 750c-193.85 0-351.56-157.71-351.56-351.56s157.71-351.56 351.56-351.56c193.86 0 351.56 157.71 351.56 351.56s-157.71 351.56-351.56 351.56z" />
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
  { id: "feed", label: "Feed Preview" },
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
