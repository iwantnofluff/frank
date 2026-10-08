"use client";

import { useEffect, useRef } from "react";
import { usePresence } from "@/hooks/use-presence";
import { useMarkNotificationsRead, type NotificationRow } from "@/hooks/use-notifications";
import { avatarColour } from "@/lib/avatar-colour";
import { initials } from "@/lib/initials";

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

// The prototype's #notif: a panel under the bell, newest first, unread on
// a blue wash, with Mark All Read. Opening one marks it read and opens its
// window. Opens and closes with the menus' motion (hooks/use-presence.ts).
export function NotificationsPanel({
  open,
  items,
  anchor,
  onClose,
  onOpenItem,
}: {
  open: boolean;
  items: NotificationRow[];
  anchor: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onOpenItem: (n: NotificationRow) => void;
}) {
  const pop = usePresence(open);
  const panel = useRef<HTMLDivElement>(null);
  const markRead = useMarkNotificationsRead();
  const unread = items.filter((n) => !n.read_at);

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

  if (!pop.shown) return null;

  return (
    <div className={`notif${pop.isOpen ? " is-open" : ""}`} ref={panel} role="dialog" aria-label="Notifications">
      <div className="notif-h">
        <b>Notifications</b>
        <div className="grow" />
        <button
          type="button"
          className="btn ghost sm"
          disabled={!unread.length || markRead.isPending}
          onClick={() => markRead.mutate(undefined)}
        >
          Mark All Read
        </button>
      </div>
      <div className="notif-b">
        {items.length === 0 && <p className="notif-empty">You&apos;re all caught up.</p>}
        {items.map((n) => {
          const post = n.creative;
          const client = post?.project?.client?.name ?? "";
          return (
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
                  <b>{post?.name ?? "A post"}</b>
                  {client ? ` · ${client}` : ""}. {post?.due_on ? "Past its due date" : "Approved a while ago"}, with
                  no live date: remove its artwork?
                </span>
                <time dateTime={n.created_at}>{ago(n.created_at)}</time>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
