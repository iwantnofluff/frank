"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useClients } from "@/hooks/use-clients";
import { useProjectsOfClients } from "@/hooks/use-projects";
import { usePresence } from "@/hooks/use-presence";
import { SearchIcon } from "./icons";

type Hit = { kind: "client" | "project"; id: string; name: string; clientName?: string; href: string };

const MAX = 8;

// The header's search (direct instruction): as you type, the clients and
// projects you can see whose names contain it, each marked Client or
// Project in a subtle pill; a project also shows its client. Arrow keys
// and Enter, or a click, open one; ⌘K / Ctrl K jumps here from anywhere.
// What's listed is what RLS lets you read, archived clients and projects
// left out.
export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const { data: clients } = useClients();
  const live = useMemo(() => (clients ?? []).filter((c) => !c.archived_at), [clients]);
  const { data: projects } = useProjectsOfClients(live.map((c) => c.id));

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const names = new Map(live.map((c) => [c.id, c.name]));
    const clientHits: Hit[] = live
      .filter((c) => c.name.toLowerCase().includes(q))
      .map((c) => ({ kind: "client", id: c.id, name: c.name, href: `/clients/${c.id}` }));
    const projectHits: Hit[] = (projects ?? [])
      .filter((p) => p.name.toLowerCase().includes(q))
      .map((p) => ({ kind: "project", id: p.id, name: p.name, clientName: names.get(p.client_id), href: `/projects/${p.id}` }));
    // Names that start with what's typed first, then the rest.
    const starts = (h: Hit) => (h.name.toLowerCase().startsWith(q) ? 0 : 1);
    return [...clientHits, ...projectHits].sort((a, b) => starts(a) - starts(b)).slice(0, MAX);
  }, [query, live, projects]);

  const shown = open && query.trim().length > 0;
  const pop = usePresence(shown);

  // ⌘K / Ctrl K from anywhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Closes on a click anywhere else.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function go(hit: Hit) {
    setOpen(false);
    setQuery("");
    input.current?.blur();
    router.push(hit.href);
  }

  return (
    <div className="gsearch" ref={box}>
      <label className="search">
        <SearchIcon />
        <input
          ref={input}
          type="search"
          placeholder="Search"
          aria-label="Search clients and projects"
          role="combobox"
          aria-expanded={shown}
          aria-controls="gsearch-results"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              input.current?.blur();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && hits[active]) {
              e.preventDefault();
              go(hits[active]);
            }
          }}
        />
        <span className="kbd">⌘K</span>
      </label>
      {pop.shown && (
        <div
          id="gsearch-results"
          role="listbox"
          aria-label="Search results"
          className={`colpop on motion gsearch-pop${pop.isOpen ? " is-open" : ""}`}
        >
          {hits.length === 0 ? (
            <p className="gsearch-none">No client or project called that.</p>
          ) : (
            hits.map((h, i) => (
              <button
                key={`${h.kind}-${h.id}`}
                type="button"
                role="option"
                aria-selected={i === active}
                className="gsearch-hit"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(h)}
              >
                <span className="gsearch-name">
                  <b>{h.name}</b>
                  {h.clientName && <span className="gsearch-client">{h.clientName}</span>}
                </span>
                <span className="gsearch-kind">{h.kind === "client" ? "Client" : "Project"}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
