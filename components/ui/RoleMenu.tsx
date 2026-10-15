"use client";

import { useEffect, useRef, useState } from "react";
import { usePresence } from "@/hooks/use-presence";
import { useViewportFit } from "@/hooks/use-viewport-fit";

export type RoleMenuItem = { label: string; onClick: () => void; tone?: "danger" };

// Someone's role as a dropdown on the tag itself (direct instruction, in
// place of a row's ⋮ menu, in every list of people): the roles they can be
// given, the current one ticked and picked straight away, then the row's
// other options under a line. Client Settings' and a project's People
// (PersonTypeMenu: User or Client) and Workspace Settings' Team (Owner,
// Admin or User).
export function RoleMenu<V extends string>({
  name,
  what = "role",
  value,
  current,
  options,
  onPick,
  extra,
  disabled,
}: {
  // Whose it is, for its label.
  name: string;
  // What's being picked, for the menu's label ("type", "role").
  what?: string;
  value: V;
  // What the tag reads.
  current: string;
  options: { value: V; label: string }[];
  onPick: (value: V) => void;
  extra: RoleMenuItem[];
  disabled?: boolean;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  // Opens and closes with motion (hooks/use-presence.ts).
  const pop = usePresence(anchor);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useViewportFit(ref, pop.shown, { side: "below", gap: 4, align: "end" });

  useEffect(() => {
    if (!anchor) return;
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t) || trigger.current?.contains(t)) return;
      setAnchor(null);
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

  function pick(fn: () => void) {
    setAnchor(null);
    fn();
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="typesel"
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        aria-label={`${name}: ${current}. Change`}
        disabled={disabled}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setAnchor((prev) => (prev ? null : rect));
        }}
      >
        {current}
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {pop.shown && (
        <div
          className={`colpop on motion${pop.isOpen ? " is-open" : ""}`}
          ref={ref}
          role="menu"
          aria-label={`${name}'s ${what}`}
          style={{ width: 190 }}
        >
          <div className="cp-b" style={{ padding: "4px 4px" }}>
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="menuitemradio"
                aria-checked={value === o.value}
                className="cpr"
                onClick={() => pick(() => o.value !== value && onPick(o.value))}
              >
                <span className="cn">{o.label}</span>
                {value === o.value && (
                  <svg className="typesel-tick" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            ))}
            {options.length > 0 && extra.length > 0 && <div className="typesel-sep" />}
            {extra.map((item) => (
              <button key={item.label} type="button" role="menuitem" className="cpr" onClick={() => pick(item.onClick)}>
                <span className="cn" style={item.tone === "danger" ? { color: "var(--rose)" } : undefined}>
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
