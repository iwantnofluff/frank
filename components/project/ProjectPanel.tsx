"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePresence } from "@/hooks/use-presence";
import { useLiveUpdates } from "@/hooks/use-live-updates";
import { useProjectActivity, type ActivityRow } from "@/hooks/use-project-activity";
import {
  useDiscussionActions,
  useProjectDiscussion,
  useProjectTeam,
  type DiscussionMessage,
  type TeamMember,
} from "@/hooks/use-project-discussion";
import { useCurrentUser } from "@/hooks/use-current-user";
import { activityLine, namesPost } from "@/lib/project-activity";
import { errorMessage } from "@/lib/errors";
import { BRAND } from "@/lib/brand";

export type ProjectPanelView = "activity" | "discussion";

// A project's Activity log and Discussion (phase84, direct instruction,
// after monday.com's board panel): from the project's "…" menu, in a panel
// from the right with the Help panel's shell and motion. The team only.
export function ProjectPanel({
  projectId,
  projectName,
  view,
  onClose,
}: {
  projectId: string;
  projectName: string;
  view: ProjectPanelView | null;
  onClose: () => void;
}) {
  const pop = usePresence(view);
  if (!pop.shown) return null;
  const shown = pop.shown;
  // "Q4 Social Activity Log" (direct instruction), after Frank's mark.
  const title = `${projectName} ${shown === "activity" ? "Activity Log" : "Discussion"}`;
  return (
    <aside
      className={`helppanel ppanel${pop.isOpen ? " is-open" : ""}`}
      aria-label={shown === "activity" ? "Activity log" : "Discussion"}
    >
      <div className="help-h">
        {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG */}
        <img className="help-mark" src={BRAND.logomark} alt="" aria-hidden="true" />
        <b className="pj-title">{title}</b>
        <button type="button" className="help-ib" aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="help-b">
        {shown === "activity" ? <Activity projectId={projectId} /> : <Discussion projectId={projectId} />}
      </div>
    </aside>
  );
}

// "Today", "Yesterday", or "Fri 9 Oct".
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

function Activity({ projectId }: { projectId: string }) {
  const q = useProjectActivity(projectId, true);
  const rows = useMemo(() => q.data?.pages.flat() ?? [], [q.data]);
  if (q.isPending) return <p className="pj-empty">Frank is working…</p>;
  if (q.isError) return <p className="pj-err">{errorMessage(q.error, "Couldn't load the activity")}</p>;
  if (!rows.length) return <p className="pj-empty">Nothing has happened here yet.</p>;
  return (
    <div className="pj-activity">
      {rows.map((r, i) => {
        // A day's heading over its first entry.
        const day = dayLabel(r.at);
        const head = i === 0 || dayLabel(rows[i - 1].at) !== day ? <p className="pj-day">{day}</p> : null;
        return (
          <div key={`${r.at}-${r.kind}-${i}`}>
            {head}
            <ActivityItem row={r} />
          </div>
        );
      })}
      {q.hasNextPage && (
        <button type="button" className="btn sm pj-more" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
          {q.isFetchingNextPage ? "Loading…" : "Show earlier"}
        </button>
      )}
    </div>
  );
}

function ActivityItem({ row }: { row: ActivityRow }) {
  const line = activityLine(row);
  const post = namesPost(row.kind, row.creative_name) ? row.creative_name : null;
  return (
    <div className="pj-act">
      <span className="pj-time">{timeOf(row.at)}</span>
      <p>
        {line.who && <b>{line.who} </b>}
        {line.before}
        {post &&
          (row.creative_id ? (
            <Link href={`/creatives/${row.creative_id}`} className="pj-post">
              {post}
            </Link>
          ) : (
            <span className="pj-post">{post}</span>
          ))}
        {line.after}
      </p>
    </div>
  );
}

function Discussion({ projectId }: { projectId: string }) {
  const q = useProjectDiscussion(projectId, true);
  const team = useProjectTeam(projectId, true);
  const { data: me } = useCurrentUser();
  // Everyone's new messages, as they're posted.
  useLiveUpdates(`discussion:${projectId}`, [{ table: "project_discussion", filter: `project_id=eq.${projectId}` }], [
    ["project-discussion", projectId],
  ]);
  const threads = useMemo(() => {
    const all = q.data ?? [];
    // Newest thread first, its replies oldest first under it.
    return all
      .filter((m) => !m.parent_id)
      .reverse()
      .map((t) => ({ thread: t, replies: all.filter((m) => m.parent_id === t.id) }));
  }, [q.data]);

  return (
    <div className="pj-disc">
      <Composer projectId={projectId} parentId={null} team={team.data ?? []} placeholder="Write an update and mention others with @" />
      {q.isPending ? (
        <p className="pj-empty">Frank is working…</p>
      ) : q.isError ? (
        <p className="pj-err">{errorMessage(q.error, "Couldn't load the discussion")}</p>
      ) : threads.length === 0 ? (
        <p className="pj-empty">No discussion yet. Start one above; only your team sees it.</p>
      ) : (
        threads.map(({ thread, replies }) => (
          <div className="pj-thread" key={thread.id}>
            <Message projectId={projectId} message={thread} mine={thread.author_id === me?.id} team={team.data ?? []} />
            {replies.map((r) => (
              <div className="pj-reply" key={r.id}>
                <Message projectId={projectId} message={r} mine={r.author_id === me?.id} team={team.data ?? []} />
              </div>
            ))}
            <div className="pj-reply">
              <Composer projectId={projectId} parentId={thread.id} team={team.data ?? []} placeholder="Write a reply and mention others with @" small />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// The words, with each @Name that's a mention marked.
function Body({ text, mentions, team }: { text: string; mentions: string[]; team: TeamMember[] }) {
  const names = team.filter((t) => mentions.includes(t.user_id)).map((t) => `@${t.name}`);
  if (!names.length) return <>{text}</>;
  const pattern = new RegExp(`(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  return (
    <>
      {text.split(pattern).map((part, i) =>
        names.includes(part) ? (
          <span className="pj-mention" key={i}>
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

function Message({
  projectId,
  message,
  mine,
  team,
}: {
  projectId: string;
  message: DiscussionMessage;
  mine: boolean;
  team: TeamMember[];
}) {
  const { remove } = useDiscussionActions(projectId);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const initials = (message.author_name ?? "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="pj-msg">
      <span className="pj-av" aria-hidden="true">
        {initials}
      </span>
      <div className="pj-msg-b">
        <div className="pj-msg-h">
          <b>{message.author_name ?? "Someone"}</b>
          <span title={new Date(message.created_at).toLocaleString("en-GB")}>
            {dayLabel(message.created_at)}, {timeOf(message.created_at)}
          </span>
          {message.edited_at && !message.deleted_at && <span>· Edited</span>}
        </div>
        {message.deleted_at ? (
          <p className="pj-deleted">This message was deleted.</p>
        ) : editing ? (
          <Composer
            projectId={projectId}
            parentId={message.parent_id}
            team={team}
            editing={message}
            onDone={() => setEditing(false)}
            small
          />
        ) : (
          <p className="pj-text">
            <Body text={message.body} mentions={message.mentions} team={team} />
          </p>
        )}
        {mine && !message.deleted_at && !editing && (
          <div className="pj-acts">
            {confirming ? (
              <>
                <span>Delete this message?</span>
                <button type="button" className="linkbtn danger" disabled={remove.isPending} onClick={() => remove.mutate(message.id)}>
                  Delete
                </button>
                <button type="button" className="linkbtn" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button type="button" className="linkbtn" onClick={() => setEditing(true)}>
                  Edit
                </button>
                <button type="button" className="linkbtn" onClick={() => setConfirming(true)}>
                  Delete
                </button>
              </>
            )}
            {remove.isError && <span className="pj-err">{errorMessage(remove.error, "Couldn't delete it")}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// Writing a thread, a reply, or an edit. Typing @ offers the project's team;
// picking one puts @Name in and remembers who, kept only while @Name stays.
function Composer({
  projectId,
  parentId,
  team,
  placeholder,
  small,
  editing,
  onDone,
}: {
  projectId: string;
  parentId: string | null;
  team: TeamMember[];
  placeholder?: string;
  small?: boolean;
  editing?: DiscussionMessage;
  onDone?: () => void;
}) {
  const { post, edit } = useDiscussionActions(projectId);
  const [text, setText] = useState(editing?.body ?? "");
  const [picked, setPicked] = useState<string[]>(editing?.mentions ?? []);
  const [query, setQuery] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  // Where the caret goes once a picked name is in: straight after it, the
  // moment the new words are on screen, before anything else is typed.
  const caretAt = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (caretAt.current === null) return;
    box.current?.focus();
    box.current?.setSelectionRange(caretAt.current, caretAt.current);
    caretAt.current = null;
  }, [text]);
  const action = editing ? edit : post;

  const matches = query === null ? [] : team.filter((t) => t.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);

  function onChange(value: string, caret: number) {
    setText(value);
    // An @ word being typed, right before the caret.
    const m = value.slice(0, caret).match(/(?:^|\s)@([^\s@]{0,30})$/);
    setQuery(m ? m[1] : null);
  }

  function pick(member: TeamMember) {
    const el = box.current;
    const caret = el?.selectionStart ?? text.length;
    const start = text.slice(0, caret).lastIndexOf("@");
    const next = `${text.slice(0, start)}@${member.name} ${text.slice(caret)}`;
    setText(next);
    setPicked((p) => (p.includes(member.user_id) ? p : [...p, member.user_id]));
    setQuery(null);
    caretAt.current = start + member.name.length + 2;
  }

  function submit() {
    const body = text.trim();
    if (!body) return;
    const mentions = picked.filter((id) => {
      const name = team.find((t) => t.user_id === id)?.name;
      return name && body.includes(`@${name}`);
    });
    const done = () => {
      setText("");
      setPicked([]);
      onDone?.();
    };
    if (editing) edit.mutate({ id: editing.id, body, mentions }, { onSuccess: done });
    else post.mutate({ body, parentId, mentions }, { onSuccess: done });
  }

  return (
    <div className={`pj-comp${small ? " small" : ""}`}>
      <textarea
        ref={box}
        className="bin"
        rows={small ? 2 : 3}
        value={text}
        placeholder={placeholder}
        aria-label={editing ? "Edit message" : parentId ? "Reply" : "New message"}
        onChange={(e) => onChange(e.target.value, e.target.selectionStart)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setQuery(null);
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
      />
      {matches.length > 0 && (
        <div className="pj-pick" role="listbox" aria-label="Mention someone">
          {matches.map((m) => (
            <button
              type="button"
              role="option"
              aria-selected="false"
              key={m.user_id}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m);
              }}
            >
              @{m.name}
            </button>
          ))}
        </div>
      )}
      <div className="pj-comp-f">
        {action.isError && <span className="pj-err">{errorMessage(action.error, "Couldn't save it")}</span>}
        {editing && (
          <button type="button" className="btn sm" onClick={onDone}>
            Cancel
          </button>
        )}
        <button type="button" className="btn sm primary" disabled={!text.trim() || action.isPending} onClick={submit}>
          {editing ? "Save" : parentId ? "Reply" : "Post"}
        </button>
      </div>
    </div>
  );
}
