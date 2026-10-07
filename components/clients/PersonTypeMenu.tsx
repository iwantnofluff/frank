"use client";

import { useEffect, useRef, useState } from "react";
import { usePresence } from "@/hooks/use-presence";
import { useViewportFit } from "@/hooks/use-viewport-fit";
import type { ClientPerson } from "@/hooks/use-project-access";

type Item = { label: string; onClick: () => void; tone?: "danger" };

const LABEL: Record<ClientPerson["kind"], string> = { user: "User", client: "Client" };

// Someone's type on a client's People, as a dropdown on the tag itself
// (direct instruction, in place of the row's ⋮ menu): User or Client of
// this client, picked straight away, then a pending invite's own options.
export function PersonTypeMenu({
  person,
  onSwitch,
  extra,
  disabled,
}: {
  person: ClientPerson;
  onSwitch: (to: ClientPerson["kind"]) => void;
  extra: Item[];
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
        aria-label={`${person.name}: ${LABEL[person.kind]}. Change`}
        disabled={disabled}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setAnchor((prev) => (prev ? null : rect));
        }}
      >
        {LABEL[person.kind]}
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {pop.shown && (
        <div
          className={`colpop on motion${pop.isOpen ? " is-open" : ""}`}
          ref={ref}
          role="menu"
          aria-label={`${person.name}'s type`}
          style={{ width: 190 }}
        >
          <div className="cp-b" style={{ padding: "4px 4px" }}>
            {(["user", "client"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                role="menuitemradio"
                aria-checked={person.kind === kind}
                className="cpr"
                onClick={() => pick(() => onSwitch(kind))}
              >
                <span className="cn">{LABEL[kind]}</span>
                {person.kind === kind && (
                  <svg className="typesel-tick" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            ))}
            {extra.length > 0 && <div className="typesel-sep" />}
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
