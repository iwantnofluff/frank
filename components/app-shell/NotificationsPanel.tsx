"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePresence } from "@/hooks/use-presence";
import { useDeleteNotifications, useMarkNotificationsRead, type NotificationRow } from "@/hooks/use-notifications";
import { errorMessage } from "@/lib/errors";
import { avatarColour } from "@/lib/avatar-colour";
import { initials } from "@/lib/initials";
import { BRAND } from "@/lib/brand";
import { displayVersion } from "@/lib/release-version";
import type { Release } from "@/lib/releases";

function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

// Who a notification is from (direct instruction: filter by person): the
// commenter, the mentioner, the approver, or Frank for its own reminders.
function personOf(n: NotificationRow): string {
  if (n.kind === "discussion_mention") return n.mention?.who ?? "Someone";
  if (n.kind === "client_comment") return n.comment?.who ?? "The client";
  if (n.kind === "client_approval") return n.creative?.approved_by_name ?? "The client";
  return "Frank";
}
function clientOf(n: NotificationRow): string {
  return n.creative?.project?.client?.name ?? n.mention?.project.client ?? "";
}

type Tab = "all" | "unread" | "read";

// The prototype's #notif: a panel under the bell, newest first, unread on
// a blue wash, with Mark All Read. Opening one marks it read and opens its
// window. Opens and closes with the menus' motion (hooks/use-presence.ts).
// All, Unread and Read with their counts; read ones selectable and
// deletable; a filter by person and client (direct instruction).
export function NotificationsPanel({
  open,
  items,
  anchor,
  onClose,
  onOpenItem,
  releases = [],
  onOpenRelease,
  onReadReleases,
  onOpenSettings,
}: {
  open: boolean;
  items: NotificationRow[];
  anchor: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onOpenItem: (n: NotificationRow) => void;
  // New versions of Frank not yet seen (direct instruction), above the rest.
  releases?: Release[];
  onOpenRelease?: (r: Release) => void;
  onReadReleases?: () => void;
  // Your own Notifications settings (tips, phase116); the team only.
  onOpenSettings?: () => void;
}) {
  const pop = usePresence(open);
  const panel = useRef<HTMLDivElement>(null);
  const markRead = useMarkNotificationsRead();
  const remove = useDeleteNotifications();
  const unread = items.filter((n) => !n.read_at);
  const [tab, setTab] = useState<Tab>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const [people, setPeople] = useState<Set<string>>(new Set());
  const [clients, setClients] = useState<Set<string>>(new Set());
  const filtering = people.size > 0 || clients.size > 0;
  const allPeople = useMemo(() => [...new Set(items.map(personOf))].sort(), [items]);
  const allClients = useMemo(() => [...new Set(items.map(clientOf).filter(Boolean))].sort(), [items]);
  const shown = items.filter(
    (n) => (!people.size || people.has(personOf(n))) && (!clients.size || clients.has(clientOf(n))),
  );
  const toggle = (set: Set<string>, value: string) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !anchor.current?.contains(t)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !document.querySelector(".scrim:not(.closing)")) onClose();
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchor]);

  const unreadItems = shown.filter((n) => !n.read_at);
  const readItems = shown.filter((n) => n.read_at);
  // New versions of Frank are unread, but have no person or client.
  const shownReleases = filtering ? [] : releases;
  const counts = {
    unread: unreadItems.length + shownReleases.length,
    read: readItems.length,
    all: unreadItems.length + shownReleases.length + readItems.length,
  };
  // Only what's selected and still in view counts.
  const chosen = readItems.filter((n) => selected.has(n.id)).map((n) => n.id);
  const allChosen = readItems.length > 0 && chosen.length === readItems.length;
  const row = (n: NotificationRow) => {
    const post = n.creative;
    const client = post?.project?.client?.name ?? n.mention?.project.client ?? "";
    const button = (
      <button
        key={n.id}
        type="button"
        className={`nrow${n.read_at ? "" : " unread"}`}
        onClick={() => {
          if (!n.read_at) markRead.mutate([n.id]);
          onOpenItem(n);
        }}
      >
        <span className="ni" style={{ background: avatarColour(client || "Frank") }}>
          {initials(client, "F")}
        </span>
        <span>
          <span className="nt">
            {n.kind === "discussion_mention" ? (
              <>
                <b>{n.mention?.who ?? "Someone"}</b> mentioned you in <b>{n.mention?.project.name ?? "a project"}</b>
                {client ? ` · ${client}` : ""}
                {n.mention?.body && <span className="nq">“{n.mention.body}”</span>}
              </>
            ) : n.kind === "client_comment" ? (
              <>
                <b>{n.comment?.who ?? "The client"}</b> commented on <b>{post?.name ?? "a post"}</b>
                {client ? ` · ${client}` : ""}
                {n.comment?.body && <span className="nq">“{n.comment.body}”</span>}
              </>
            ) : n.kind === "client_approval" ? (
              <>
                <b>{post?.approved_by_name ?? "The client"}</b> approved <b>{post?.name ?? "a post"}</b>
                {client ? ` · ${client}` : ""}
              </>
            ) : n.kind === "live_unapproved" ? (
              <>
                <b>{post?.name ?? "A post"}</b>
                {client ? ` · ${client}` : ""} went live on Instagram before it was approved.
              </>
            ) : (
              <>
                <b>{post?.name ?? "A post"}</b>
                {client ? ` · ${client}` : ""}. {post?.due_on ? "Past its due date" : "Approved a while ago"}, with
                no live date: remove its artwork?
              </>
            )}
          </span>
          <time dateTime={n.created_at}>{ago(n.created_at)}</time>
        </span>
      </button>
    );
    // Tick boxes only on the Read tab (direct instruction).
    if (!n.read_at || tab !== "read") return button;
    return (
      <div className="nrow-sel" key={n.id}>
        <input
          type="checkbox"
          aria-label={`Select ${post?.name ?? n.mention?.project.name ?? "this notification"}`}
          checked={selected.has(n.id)}
          onChange={() => setSelected((s) => toggle(s, n.id))}
        />
        {button}
      </div>
    );
  };

  if (!pop.shown) return null;

  return (
    <div className={`notif${pop.isOpen ? " is-open" : ""}`} ref={panel} role="dialog" aria-label="Notifications">
      <div className="notif-h">
        <b>Notifications</b>
        <div className="grow" />
        {onOpenSettings && (
          <button
            type="button"
            className="notif-filter"
            aria-label="Notification settings"
            title="Notification settings"
            onClick={onOpenSettings}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-3-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H2.5a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-3l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V2.5a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 3 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </svg>
          </button>
        )}
        <button
          type="button"
          className={`notif-filter${filtering ? " on" : ""}`}
          aria-label="Filter by person or client"
          aria-expanded={filterOpen}
          title="Filter by person or client"
          onClick={() => setFilterOpen((o) => !o)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 5h16l-6 7.5V19l-4-2v-4.5L4 5z" />
          </svg>
        </button>
        <button
          type="button"
          className="btn ghost sm"
          disabled={(!unread.length && !releases.length) || markRead.isPending}
          onClick={() => {
            if (unread.length) markRead.mutate(undefined);
            if (releases.length) onReadReleases?.();
          }}
        >
          Mark All Read
        </button>
      </div>
      <div className="notif-tabs" role="group" aria-label="Show">
        {(["all", "unread", "read"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className="chip"
            aria-pressed={tab === t}
            onClick={() => {
              setTab(t);
              setSelected(new Set());
            }}
          >
            {t === "all" ? "All" : t === "unread" ? "Unread" : "Read"} ({counts[t]})
          </button>
        ))}
      </div>
      {filterOpen && (
        <div className="notif-filters">
          <div className="notif-fgroup">
            <div className="notif-sec">People</div>
            {allPeople.map((p) => (
              <label key={p} className="notif-fopt">
                <input type="checkbox" checked={people.has(p)} onChange={() => setPeople((s) => toggle(s, p))} />
                {p}
              </label>
            ))}
          </div>
          <div className="notif-fgroup">
            <div className="notif-sec">Clients</div>
            {allClients.length === 0 && <span className="notif-fnone">None</span>}
            {allClients.map((c) => (
              <label key={c} className="notif-fopt">
                <input type="checkbox" checked={clients.has(c)} onChange={() => setClients((s) => toggle(s, c))} />
                {c}
              </label>
            ))}
          </div>
          {filtering && (
            <button
              type="button"
              className="linkbtn notif-fclear"
              onClick={() => {
                setPeople(new Set());
                setClients(new Set());
              }}
            >
              Clear
            </button>
          )}
        </div>
      )}
      <div className="notif-b">
        {counts[tab] === 0 && (
          <p className="notif-empty">
            {filtering ? "Nothing matches the filter." : tab === "read" ? "Nothing read yet." : "You're all caught up."}
          </p>
        )}
        {tab !== "read" && counts.unread > 0 && <div className="notif-sec">Unread</div>}
        {tab !== "read" && shownReleases.map((r) => (
          <button key={r.version} type="button" className="nrow unread" onClick={() => onOpenRelease?.(r)}>
            <span className="ni ni-frank" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG */}
              <img src={BRAND.logomark} alt="" />
            </span>
            <span>
              <span className="nt">
                <b>Frank {displayVersion(r.version)} is here</b>: {r.title}
              </span>
              <time dateTime={r.date}>See what&apos;s new</time>
            </span>
          </button>
        ))}
        {/* Unread, then Read (direct instruction): a read one stays in
            the bell until the workspace's keep time passes (phase90). */}
        {tab !== "read" && unreadItems.map(row)}
        {tab === "all" && readItems.length > 0 && <div className="notif-sec">Read</div>}
        {tab === "read" && readItems.length > 0 && (
          <div className="notif-sec notif-readh">
            <label className="notif-all">
              <input
                type="checkbox"
                aria-label="Select all read"
                checked={allChosen}
                onChange={() => setSelected(allChosen ? new Set() : new Set(readItems.map((n) => n.id)))}
              />
              All
            </label>
            <div className="grow" />
            {chosen.length > 0 && (
              <button
                type="button"
                className="linkbtn danger"
                disabled={remove.isPending}
                onClick={() => remove.mutate(chosen, { onSuccess: () => setSelected(new Set()) })}
              >
                {remove.isPending ? "Deleting…" : `Delete (${chosen.length})`}
              </button>
            )}
          </div>
        )}
        {/* Said plainly, not as the database put it ("permission denied for
            table notifications"); our own message when only some went. */}
        {remove.isError && (
          <p className="autherr notif-err">
            {remove.error instanceof Error && !("code" in remove.error)
              ? errorMessage(remove.error, "Couldn't delete them")
              : "Couldn\u2019t delete these. Please try again, or contact support if it keeps happening."}
          </p>
        )}
        {tab !== "unread" && readItems.map(row)}
      </div>
    </div>
  );
}
