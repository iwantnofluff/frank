"use client";

import { useEffect, useRef, useState } from "react";
import { useViewportFit } from "@/hooks/use-viewport-fit";
import { PROJECT_ICONS, projectIcon, type ProjectIcon } from "@/lib/project-icons";

export function projectInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function IconGlyph({ icon }: { icon: ProjectIcon }) {
  return (
    <svg className="picon" viewBox="0 0 24 24" aria-hidden="true">
      {icon.paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

// A project's tile on the client workspace's rows (phase56): its emoticon
// in white on its colour, or its initials when it has none. Owners and
// Admins pick the emoticon from the tile itself; for everyone else it's
// just the picture. Every click here stops at the tile: it sits inside the
// row's <Link>, which must not navigate while the picker is in use
// (RowActionsMenu's shape).
export function ProjectAvatar({
  name,
  colour,
  icon,
  canPick,
  onPick,
}: {
  name: string;
  colour: string | null;
  icon: string | null;
  canPick: boolean;
  // null goes back to the initials.
  onPick: (icon: string | null) => void;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useViewportFit(ref, anchor, { side: "below", gap: 6 });

  useEffect(() => {
    if (!anchor) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAnchor(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAnchor(null);
    }
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [anchor]);

  const chosen = projectIcon(icon);
  const face = chosen ? <IconGlyph icon={chosen} /> : projectInitials(name);
  const background = colour || "#6B7280";

  if (!canPick) {
    return (
      <div className="logo" style={{ background }} title={chosen?.label}>
        {face}
      </div>
    );
  }

  function pick(next: string | null) {
    setAnchor(null);
    if (next !== icon) onPick(next);
  }

  return (
    <>
      <button
        type="button"
        className="logo logo-pick"
        style={{ background }}
        title="Change picture"
        aria-label={`Change ${name}'s picture`}
        aria-expanded={!!anchor}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          setAnchor((prev) => (prev ? null : rect));
        }}
      >
        {face}
      </button>
      {anchor && (
        <div
          className="colpop on iconpick"
          ref={ref}
          role="dialog"
          aria-label={`Picture for ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          <div className="cp-h">
            <b>Project picture</b>
          </div>
          <div className="iconpick-grid">
            <button
              type="button"
              className="iconpick-cell"
              style={{ background }}
              aria-pressed={!chosen}
              title="Initials"
              aria-label="Initials"
              onClick={() => pick(null)}
            >
              {projectInitials(name)}
            </button>
            {PROJECT_ICONS.map((i) => (
              <button
                key={i.id}
                type="button"
                className="iconpick-cell"
                style={{ background }}
                aria-pressed={chosen?.id === i.id}
                title={i.label}
                aria-label={i.label}
                onClick={() => pick(i.id)}
              >
                <IconGlyph icon={i} />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
