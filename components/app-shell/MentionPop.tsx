"use client";

import { useSyncExternalStore } from "react";
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

  const waiting = gone === null ? [] : (data ?? []).filter((n) => !n.read_at && !gone.includes(n.id) && hrefOf(n) !== null);
  const n = waiting[0];
  if (!n) return null;
  const href = hrefOf(n)!;
  const who = n.kind === "comment_mention" ? n.comment!.who : n.mention!.who;
  const where = n.kind === "comment_mention" ? n.creative!.name : `${n.mention!.project.name}'s Discussion`;
  const body = n.kind === "comment_mention" ? n.comment!.body : n.mention!.body;

  const dismiss = () => writeStore([...gone!, n.id].slice(-200));

  return (
    <div className="mentionpop" role="status" aria-label="You were mentioned">
      <div className="mp-text">
        <b>{who}</b> mentioned you on <b>{where}</b>
        <span className="mp-quote">{body}</span>
        {waiting.length > 1 && <span className="mp-more">and {waiting.length - 1} more in your bell</span>}
      </div>
      <div className="mp-acts">
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
