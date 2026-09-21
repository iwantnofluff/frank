"use client";

import { useEffect, useMemo, useState } from "react";
import { useCreative } from "@/hooks/use-creative";
import { useMyMembership } from "@/hooks/use-my-membership";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useComments, type CommentRow } from "@/hooks/use-comments";
import { useCreateComment } from "@/hooks/use-create-comment";
import { useToggleCommentResolved } from "@/hooks/use-toggle-comment-resolved";
import { isHighlightAnchor, isPinAnchor, isRegionAnchor } from "@/lib/annotations";

function AnchorBadge({ anchor }: { anchor: CommentRow["anchor"] }) {
  if (isPinAnchor(anchor)) {
    return (
      <span className="anchor pin-a">
        <svg viewBox="0 0 24 24">
          <path d="M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11z" />
        </svg>
        Pin {anchor.n}
      </span>
    );
  }
  if (isRegionAnchor(anchor)) {
    return (
      <span className="anchor pin-a">
        <svg viewBox="0 0 24 24">
          <rect x="3.5" y="3.5" width="17" height="17" rx="2" strokeDasharray="4 3" />
        </svg>
        Region {anchor.n}
      </span>
    );
  }
  if (isHighlightAnchor(anchor)) {
    return <span className="anchor hl-a">&ldquo;{anchor.quote}&rdquo;</span>;
  }
  return null;
}

type Filter = "all" | "unresolved" | "resolved" | "mine" | "internal";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unresolved", label: "Unresolved" },
  { key: "resolved", label: "Resolved" },
  { key: "mine", label: "Mine" },
  { key: "internal", label: "Internal" },
];

const AVATAR_COLOURS = [
  "#007BFF",
  "#2BB65B",
  "#FF8A00",
  "#DD2A7B",
  "#6228D7",
  "#00547F",
];

function avatarColour(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % AVATAR_COLOURS.length;
  return AVATAR_COLOURS[hash];
}

function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?"
  );
}

function formatWhen(value: string) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function Composer({
  onSubmit,
  showInternalToggle,
  lockedPrivate,
  placeholder,
  autoFocus,
  submitLabel = "Post",
}: {
  onSubmit: (body: string, visibility: "private" | "public") => Promise<void>;
  showInternalToggle: boolean;
  lockedPrivate?: boolean;
  placeholder: string;
  autoFocus?: boolean;
  submitLabel?: string;
}) {
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibility: "private" | "public" = lockedPrivate
    ? "private"
    : internal
      ? "private"
      : "public";

  async function handleSubmit() {
    if (!body.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(body.trim(), visibility);
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't post that comment");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="composer">
      <textarea
        className="bin"
        rows={2}
        placeholder={placeholder}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        autoFocus={autoFocus}
      />
      <div className="cf">
        {showInternalToggle && !lockedPrivate ? (
          <label className="intog">
            <input
              type="checkbox"
              checked={internal}
              onChange={(e) => setInternal(e.target.checked)}
            />
            <span className="lockic">
              <svg viewBox="0 0 24 24">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
            Mark internal
          </label>
        ) : lockedPrivate ? (
          <span className="intog">Internal (replying to an internal note)</span>
        ) : null}
        <div className="grow" />
        <button
          type="button"
          className="btn primary sm"
          disabled={!body.trim() || submitting}
          onClick={handleSubmit}
        >
          {submitting ? "Posting…" : submitLabel}
        </button>
      </div>
      {error && <p className="autherr">{error}</p>}
    </div>
  );
}

function CommentCard({
  thread,
  replies,
  isStaff,
  currentUserId,
  isHighlighted,
  onSelect,
  onReply,
  onToggleResolved,
}: {
  thread: CommentRow;
  replies: CommentRow[];
  isStaff: boolean;
  currentUserId: string | undefined;
  isHighlighted: boolean;
  onSelect: () => void;
  onReply: (body: string, visibility: "private" | "public") => Promise<void>;
  onToggleResolved: (resolve: boolean) => void;
}) {
  const [replying, setReplying] = useState(false);
  const authorName = thread.author?.name ?? thread.guest_name ?? "Someone";
  // comments_update_own (supabase/seed.sql) allows author_id = auth.uid()
  // or is_agency_staff — authorship, not role. A client resolving/
  // reopening a thread they started themselves succeeds at the database
  // layer (verified empirically); isStaff alone was stricter than that,
  // and stricter than the prototype, which only gates the Make
  // Public/Private toggle behind MODE==="client", not Resolve/Reopen.
  const canResolve = isStaff || thread.author_id === currentUserId;

  return (
    <div
      id={`cmt-${thread.id}`}
      className={`cmt${thread.resolved_at ? " resolved" : ""}${isHighlighted ? " act" : ""}${thread.visibility === "private" ? " internal" : ""}`}
      onClick={thread.anchor ? onSelect : undefined}
      style={thread.anchor ? { cursor: "pointer" } : undefined}
    >
      <div className="cmt-h">
        <span
          className="who"
          style={{ background: avatarColour(authorName) }}
        >
          {initialsOf(authorName)}
        </span>
        <b>{authorName}</b>
        {thread.visibility === "private" && (
          <span className="tag grey">Private</span>
        )}
        <time>{formatWhen(thread.created_at)}</time>
      </div>
      {thread.anchor && <AnchorBadge anchor={thread.anchor} />}
      <p>{thread.body}</p>

      <div className="cmt-f">
        <button type="button" onClick={() => setReplying(!replying)}>
          Reply
        </button>
        <div className="acts">
          {canResolve && (
            <button
              type="button"
              onClick={() => onToggleResolved(!thread.resolved_at)}
            >
              {thread.resolved_at ? "Reopen" : "Resolve"}
            </button>
          )}
        </div>
      </div>

      {replies.length > 0 && (
        <div className="replies">
          {replies.map((r) => {
            const replyAuthor = r.author?.name ?? r.guest_name ?? "Someone";
            return (
              <div className="reply" key={r.id}>
                <span
                  className="who"
                  style={{ background: avatarColour(replyAuthor) }}
                >
                  {initialsOf(replyAuthor)}
                </span>
                <div className="rb">
                  <b>{replyAuthor}</b>
                  {r.visibility === "private" && (
                    <span className="tag grey">Private</span>
                  )}
                  <p>{r.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {replying && (
        <div className="replybox on">
          <Composer
            placeholder={`Reply to ${authorName}…`}
            showInternalToggle={isStaff}
            lockedPrivate={thread.visibility === "private" || undefined}
            submitLabel="Reply"
            autoFocus
            onSubmit={async (body, visibility) => {
              await onReply(body, visibility);
              setReplying(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

export function CommentsPanel({
  creativeId,
  highlightedCommentId = null,
  onHighlight,
}: {
  creativeId: string;
  highlightedCommentId?: string | null;
  onHighlight?: (commentId: string | null) => void;
}) {
  const { data: creative } = useCreative(creativeId);
  const { data: currentUser } = useCurrentUser();
  const { data: membership } = useMyMembership(creative?.agency_id);
  const { data: comments, isLoading, isError } = useComments(creativeId);
  const createComment = useCreateComment(creativeId);
  const toggleResolved = useToggleCommentResolved(creativeId);

  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    if (!highlightedCommentId) return;
    document
      .getElementById(`cmt-${highlightedCommentId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [highlightedCommentId]);

  const isStaff = membership ? membership.client_id === null : false;

  const { threads, repliesByParent, openCount } = useMemo(() => {
    const all = comments ?? [];
    const topLevel = all.filter((c) => c.parent_id === null);
    const repliesByParent = new Map<string, CommentRow[]>();
    for (const c of all) {
      if (c.parent_id) {
        const list = repliesByParent.get(c.parent_id) ?? [];
        list.push(c);
        repliesByParent.set(c.parent_id, list);
      }
    }
    const openCount = topLevel.filter((t) => !t.resolved_at).length;
    return { threads: topLevel, repliesByParent, openCount };
  }, [comments]);

  const filtered = threads.filter((thread) => {
    const replies = repliesByParent.get(thread.id) ?? [];
    switch (filter) {
      case "unresolved":
        return !thread.resolved_at;
      case "resolved":
        return !!thread.resolved_at;
      case "mine":
        return (
          thread.author_id === currentUser?.id ||
          replies.some((r) => r.author_id === currentUser?.id)
        );
      case "internal":
        return thread.visibility === "private";
      default:
        return true;
    }
  });

  return (
    <aside className="cmts">
      <div className="cmts-h">
        <b>Comments</b>
        <span className="n">{openCount} open</span>
      </div>

      <div className="cfilters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className="chip"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="cmts-b">
        {isError && (
          <div className="empty">
            <b>Couldn&rsquo;t load comments</b>
          </div>
        )}
        {!isError && !isLoading && filtered.length === 0 && (
          <div className="empty">
            <b>No comments</b>
            <span>
              {filter === "all"
                ? "Be the first to leave one."
                : "Nothing matches this filter."}
            </span>
          </div>
        )}
        {filtered.map((thread) => (
          <CommentCard
            key={thread.id}
            thread={thread}
            replies={repliesByParent.get(thread.id) ?? []}
            isStaff={isStaff}
            currentUserId={currentUser?.id}
            isHighlighted={highlightedCommentId === thread.id}
            onSelect={() => onHighlight?.(thread.id)}
            onReply={(body, visibility) =>
              createComment.mutateAsync({
                body,
                parentId: thread.id,
                visibility,
              })
            }
            onToggleResolved={(resolve) =>
              toggleResolved.mutate({ commentId: thread.id, resolve })
            }
          />
        ))}
      </div>

      <Composer
        placeholder="Add a comment…"
        showInternalToggle={isStaff}
        onSubmit={(body, visibility) =>
          createComment.mutateAsync({ body, parentId: null, visibility })
        }
      />
    </aside>
  );
}
