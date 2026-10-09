"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useClients } from "@/hooks/use-clients";
import { useProjectsOfClients } from "@/hooks/use-projects";
import { usePresence } from "@/hooks/use-presence";
import { useIsStaff } from "@/hooks/use-is-staff";
import { SETTINGS_SECTIONS } from "@/lib/settings-nav";
import { clientSettingsSections } from "@/lib/client-settings-nav";
import { SearchIcon } from "./icons";

type Hit = { kind: "page" | "client" | "project"; id: string; name: string; detail?: string; href: string };

const MAX = 10;

const DELIVERY_LABEL = { scheduled: "Content Planner", continuous: "Other Content" } as const;

// Pages anyone can open, and the words that find them.
const APP_PAGES: { name: string; href: string; words: string[] }[] = [
  { name: "Clients", href: "/dashboard", words: ["clients", "all clients", "dashboard", "home"] },
];

// The header's search (direct instruction): as you type, the pages, clients
// and projects you can see whose names contain it, each marked Page,
// Client or Project in a subtle pill, with its client or section greyed
// out. Pages are Clients, Settings' pages (staff) and each client's Client
// Settings pages; a project is also found by its type, so "planner" lists
// every Content Planner. Arrow keys and Enter, or a click, open one; ⌘K /
// Ctrl K jumps here from anywhere. What's listed is what RLS lets you
// read, archived clients and projects left out.
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
  const { isStaff, isPending: staffPending } = useIsStaff();
  const staff = isStaff && !staffPending;

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const has = (text: string) => text.toLowerCase().includes(q);
    const names = new Map(live.map((c) => [c.id, c.name]));

    const pages: Hit[] = [
      ...APP_PAGES.filter((p) => has(p.name) || p.words.some(has)).map((p) => ({
        kind: "page" as const,
        id: p.href,
        name: p.name,
        href: p.href,
      })),
      // Settings' pages, for staff (Settings itself is staff only).
      ...(staff
        ? SETTINGS_SECTIONS.flatMap((sec) =>
            sec.pages
              .filter((p) => has(p.label) || has(sec.label) || has("settings"))
              .map((p) => ({ kind: "page" as const, id: p.href, name: p.label, detail: `Settings · ${sec.label}`, href: p.href })),
          )
        : []),
      // Each client's Client Settings pages ("NuHabit · Discovery").
      ...live.flatMap((c) =>
        clientSettingsSections(c.id, staff).flatMap((sec) =>
          sec.pages
            // By the section too ("knowledge" finds Discovery), as Settings' pages are.
            .filter((p) => has(p.label) || has(sec.label) || has("client settings"))
            .map((p) => ({ kind: "page" as const, id: p.href, name: p.label, detail: `${c.name} · Client Settings`, href: p.href })),
        ),
      ),
    ];
    const clientHits: Hit[] = live
      .filter((c) => has(c.name))
      .map((c) => ({ kind: "client", id: c.id, name: c.name, href: `/clients/${c.id}` }));
    // By name, or by type ("planner" finds every Content Planner).
    const projectHits: Hit[] = (projects ?? [])
      .filter((p) => has(p.name) || has(DELIVERY_LABEL[p.delivery]) || (!!p.type && has(p.type)))
      .map((p) => ({
        kind: "project",
        id: p.id,
        name: p.name,
        detail: [names.get(p.client_id), DELIVERY_LABEL[p.delivery]].filter(Boolean).join(" · "),
        href: `/projects/${p.id}`,
      }));
    // Names that start with what's typed first, then pages, clients and
    // projects, in that order.
    const starts = (h: Hit) => (h.name.toLowerCase().startsWith(q) ? 0 : 1);
    const order = { page: 0, client: 1, project: 2 };
    return [...pages, ...clientHits, ...projectHits]
      .sort((a, b) => starts(a) - starts(b) || order[a.kind] - order[b.kind])
      .slice(0, MAX);
  }, [query, live, projects, staff]);

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
          aria-label="Search pages, clients and projects"
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
            <p className="gsearch-none">No page, client or project called that.</p>
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
                  {h.detail && <span className="gsearch-client">{h.detail}</span>}
                </span>
                <span className="gsearch-kind">{h.kind === "page" ? "Page" : h.kind === "client" ? "Client" : "Project"}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
