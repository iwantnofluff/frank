"use client";

import { useEffect, useRef, useState } from "react";
import { usePresence } from "@/hooks/use-presence";
import { useViewportFit } from "@/hooks/use-viewport-fit";
import type { ClientRow } from "@/hooks/use-clients";
import { ClientChecklist } from "@/components/team/ClientChecklist";

// "+ Add Clients" under a User's clients in Workspace Settings' Users table
// (direct instruction, in place of the Edit window): every active client to
// tick or untick, All Clients at the top for the lot, and Done. Saved once,
// when it closes with something changed, so quick ticks can't race.
export function ClientAccessMenu({
  name,
  clients,
  selected,
  onSave,
  disabled,
}: {
  // Whose they are, for its label.
  name: string;
  clients: ClientRow[];
  selected: string[];
  onSave: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [draft, setDraft] = useState<string[]>(selected);
  const pop = usePresence(anchor);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useViewportFit(ref, pop.shown, { side: "below", gap: 4, align: "start" });
  const allOn = clients.length > 0 && clients.every((c) => draft.includes(c.id));

  function close() {
    setAnchor(null);
    const changed = draft.length !== selected.length || draft.some((id) => !selected.includes(id));
    if (changed) onSave(draft);
  }
  // The latest close, for the listeners below.
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    if (!anchor) return;
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t) || trigger.current?.contains(t)) return;
      closeRef.current();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeRef.current();
    }
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [anchor]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="badd"
        aria-haspopup="dialog"
        aria-expanded={!!anchor}
        aria-label={`Add clients for ${name}`}
        disabled={disabled}
        onClick={(e) => {
          if (anchor) return close();
          setDraft(selected);
          setAnchor(e.currentTarget.getBoundingClientRect());
        }}
      >
        + Add Clients
      </button>
      {pop.shown && (
        <div
          className={`colpop on motion${pop.isOpen ? " is-open" : ""}`}
          ref={ref}
          role="dialog"
          aria-label={`${name}'s clients`}
          style={{ width: 240 }}
        >
          <div className="cp-b" style={{ padding: "4px 4px", maxHeight: 320, overflowY: "auto" }}>
            {clients.length > 1 && (
              <>
                <button
                  type="button"
                  className="cpr"
                  role="checkbox"
                  aria-checked={allOn}
                  onClick={() => setDraft(allOn ? [] : clients.map((c) => c.id))}
                >
                  <span className={allOn ? "cbx on" : "cbx"}>
                    <svg viewBox="0 0 24 24">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </span>
                  <span className="cn">All Clients</span>
                </button>
                <div className="typesel-sep" />
              </>
            )}
            <ClientChecklist clients={clients} selected={draft} onChange={setDraft} />
          </div>
          <div className="fmtpop-f">
            <button type="button" className="btn primary sm" onClick={close}>
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}
