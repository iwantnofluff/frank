"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useLiveUpdates } from "@/hooks/use-live-updates";
import { useMarkNotificationsRead, useNotifications, type NotificationRow } from "@/hooks/use-notifications";

const DISMISSED_KEY = "frank.mentionsDismissed";

// Dismissed mentions, in this browser: read with the server seeing none
// (it has no storage), so the first drawing matches; kept in memory where
// there's no storage either.
const listeners = new Set<() => void>();
let memory = "[]";
function readStore(): string {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) ?? memory;
  } catch {
    return memory;
  }
}
function writeStore(ids: string[]) {
  memory = JSON.stringify(ids);
  try {
    window.localStorage.setItem(DISMISSED_KEY, memory);
  } catch {
    // No storage: put away for this visit only.
  }
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Where a mention opens: the post at that comment, or the project's
// Discussion.
function hrefOf(n: NotificationRow): string | null {
  if (n.kind === "comment_mention" && n.creative && n.comment) return `/creatives/${n.creative.id}?comment=${n.comment.id}`;
  if (n.kind === "discussion_mention" && n.mention) return `/projects/${n.mention.project.id}?panel=discussion`;
  return null;
}

// Someone mentioned you (direct instruction, as Updates pops up): the
// moment it happens if Frank is open (phase153), and any not yet read the
// next time it is. Open Post goes there and marks it read; Dismiss puts it
// away here only, the bell keeping it either way.
export function MentionPop() {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const uid = user?.id;
  useLiveUpdates(`notifications:${uid}`, [{ table: "notifications", filter: `user_id=eq.${uid}` }], [["notifications"]], !!uid);
  const { data } = useNotifications(!!uid);
  const markRead = useMarkNotificationsRead();
  const stored = useSyncExternalStore(subscribe, readStore, () => null);
  const gone = stored === null ? null : (JSON.parse(stored) as string[]);

  // Which of several is showing (direct instruction: a stack, "1 of 4"),
  // newest first; it stays in range as they're put away.
  const [at, setAt] = useState(0);

  const waiting = gone === null ? [] : (data ?? []).filter((n) => !n.read_at && !gone.includes(n.id) && hrefOf(n) !== null);
  const index = Math.min(at, Math.max(waiting.length - 1, 0));
  const n = waiting[index];
  if (!n) return null;
  const many = waiting.length > 1;
  const href = hrefOf(n)!;
  const who = n.kind === "comment_mention" ? n.comment!.who : n.mention!.who;
  const where = n.kind === "comment_mention" ? n.creative!.name : `${n.mention!.project.name}'s Discussion`;
  const body = n.kind === "comment_mention" ? n.comment!.body : n.mention!.body;

  const dismiss = () => writeStore([...gone!, n.id].slice(-200));
  const dismissAll = () => writeStore([...gone!, ...waiting.map((w) => w.id)].slice(-200));

  return (
    <div
      className={`mentionpop${many ? " stacked" : ""}${waiting.length > 2 ? " stacked-2" : ""}`}
      role="status"
      aria-label={many ? `You were mentioned, ${index + 1} of ${waiting.length}` : "You were mentioned"}
    >
      {/* Several: which this is, and the way to the others. */}
      {many && (
        <div className="mp-nav">
          <span className="mp-count">
            {index + 1} of {waiting.length}
          </span>
          <span className="mp-arrows">
            <button type="button" aria-label="Newer mention" disabled={index === 0} onClick={() => setAt(index - 1)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button type="button" aria-label="Older mention" disabled={index === waiting.length - 1} onClick={() => setAt(index + 1)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </span>
        </div>
      )}
      <div className="mp-text">
        <b>{who}</b> mentioned you on <b>{where}</b>
        <span className="mp-quote">{body}</span>
      </div>
      <div className="mp-acts">
        {many && (
          <button type="button" className="pr-link mp-all" onClick={dismissAll}>
            Dismiss All
          </button>
        )}
        <button type="button" className="btn sm" onClick={dismiss}>
          Dismiss
        </button>
        <button
          type="button"
          className="btn primary sm"
          onClick={() => {
            markRead.mutate([n.id]);
            router.push(href);
          }}
        >
          {n.kind === "comment_mention" ? "Open Post" : "Open Discussion"}
        </button>
      </div>
    </div>
  );
}
