"use client";

import { useEffect, useRef, useState } from "react";
import { usePresence } from "@/hooks/use-presence";
import { useViewportFit } from "@/hooks/use-viewport-fit";

export interface ProjectGroup {
  name: string;
  projects: { id: string; name: string }[];
}

function Tick({ on }: { on: boolean }) {
  return (
    <span className={`cbx${on ? " on" : ""}`}>
      <svg viewBox="0 0 24 24">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </span>
  );
}

// Which projects someone being invited is put on (phase46). null is every
// project of their clients; a list is just those. Either way, a project
// made later starts with everyone on its client. The trigger is dressed as a select, opening the same .colpop of
// ticked rows as FormatPicker.
export function ProjectPicker({
  id,
  groups,
  value,
  onChange,
}: {
  id?: string;
  groups: ProjectGroup[];
  value: string[] | null;
  onChange: (next: string[] | null) => void;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  // Opens and closes with motion (hooks/use-presence.ts).
  const pop = usePresence(anchor);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useViewportFit(ref, pop.shown, { side: "below", gap: 4, align: "start" });

  useEffect(() => {
    if (!anchor) return;
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setAnchor(null);
    }
    function onKey(e: KeyboardEvent) {
      // Closes the picker, not the window behind it.
      if (e.key === "Escape") {
        e.stopPropagation();
        setAnchor(null);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [anchor]);

  const all = groups.flatMap((g) => g.projects);
  const chosen = value ?? all.map((p) => p.id);

  function toggle(pid: string) {
    const next = chosen.includes(pid) ? chosen.filter((x) => x !== pid) : [...chosen, pid];
    onChange(next.length === all.length ? null : next);
  }

  const label =
    value === null
      ? "All projects"
      : value.length === 0
        ? "No projects"
        : value.length === 1
          ? (all.find((p) => p.id === value[0])?.name ?? "1 project")
          : `${value.length} of ${all.length} projects`;

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="fmtpick projpick"
        aria-label={`Projects: ${label}`}
        aria-haspopup="dialog"
        aria-expanded={!!anchor}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setAnchor((prev) => (prev ? null : rect));
        }}
      >
        {label}
      </button>
      {pop.shown && (
        <div className={`colpop on fmtpop motion${pop.isOpen ? " is-open" : ""}`} ref={ref} role="dialog" aria-label="Projects" style={{ width: Math.max(pop.shown.width, 300) }}>
          <div className="cp-h">
            <b>Projects</b>
            <span className="cs">{value === null ? "All" : `${value.length} chosen`}</span>
          </div>
          <div className="cp-b">
            <button
              type="button"
              className="cpr all"
              role="checkbox"
              aria-checked={value === null}
              onClick={() => onChange(value === null ? [] : null)}
            >
              <Tick on={value === null} />
              <span className="cn">All projects</span>
            </button>
            {groups.map((g) => (
              <div key={g.name} role="group" aria-label={g.name}>
                {groups.length > 1 && <div className="fmtpop-cat">{g.name}</div>}
                {g.projects.map((p) => {
                  const on = chosen.includes(p.id);
                  return (
                    <button
                      type="button"
                      key={p.id}
                      className="cpr"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggle(p.id)}
                    >
                      <Tick on={on} />
                      <span className="cn">{p.name}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
