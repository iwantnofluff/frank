"use client";

import type { ClientRow } from "@/hooks/use-clients";

export function ClientChecklist({
  clients,
  selected,
  onChange,
}: {
  clients: ClientRow[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  if (clients.length === 0) return <p className="msection-empty">No clients yet.</p>;
  return (
    <div role="group" aria-label="Client access">
      {clients.map((c) => {
        const on = selected.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            className="cpr"
            role="checkbox"
            aria-checked={on}
            onClick={() => onChange(on ? selected.filter((x) => x !== c.id) : [...selected, c.id])}
          >
            <span className={on ? "cbx on" : "cbx"}>
              <svg viewBox="0 0 24 24">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </span>
            <span className="cn">{c.name}</span>
          </button>
        );
      })}
    </div>
  );
}
