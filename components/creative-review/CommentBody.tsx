"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { TeamMember } from "@/hooks/use-project-discussion";
import { MentionPicker, MentionText, useMentions } from "@/components/ui/mentions";

// A comment's words, and editing them in place when they're the viewer's
// own (direct instruction; phase75). Marked "Edited" once changed. The
// place that shows it owns whether it's being edited, so its Edit button
// can sit wherever that place's other actions are. With the project's team
// (the team's own view), its @mentions are marked and the editor offers @
// (phase138); a review link passes none.
export function CommentBody({
  body,
  editedAt,
  editing,
  onEditingChange,
  onSave,
  mentions = [],
  team = [],
}: {
  body: string;
  editedAt: string | null | undefined;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onSave: (body: string, mentions?: string[]) => Promise<unknown>;
  mentions?: string[];
  team?: TeamMember[];
}) {
  if (!editing) return <CommentWords body={body} editedAt={editedAt} mentions={mentions} team={team} />;
  return <CommentEditor body={body} mentions={mentions} team={team} onEditingChange={onEditingChange} onSave={onSave} />;
}

// Mounted only while editing, so each edit starts from the words as they are.
function CommentEditor({
  body,
  mentions,
  team,
  onEditingChange,
  onSave,
}: {
  body: string;
  mentions: string[];
  team: TeamMember[];
  onEditingChange: (editing: boolean) => void;
  onSave: (body: string, mentions?: string[]) => Promise<unknown>;
}) {
  const { text: draft, box, matches, onChange, pick, mentionsIn, closePicker } = useMentions(team, body, mentions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const next = draft.trim();
    if (!next) return;
    if (next === body.trim()) return onEditingChange(false);
    setSaving(true);
    setError(null);
    try {
      // Without the team (a client, or not loaded yet), who it mentions is
      // left as it was.
      await onSave(next, team.length ? mentionsIn(next) : undefined);
      onEditingChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the change");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="cedit" onClick={(e) => e.stopPropagation()}>
      <textarea
        ref={box}
        className="bin"
        rows={2}
        aria-label="Edit comment"
        value={draft}
        autoFocus
        onChange={(e) => onChange(e.target.value, e.target.selectionStart)}
        onKeyDown={(e) => {
          // Escape closes the @ list first, if it's open.
          if (e.key === "Escape") {
            if (matches.length) closePicker();
            else onEditingChange(false);
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save();
        }}
      />
      <MentionPicker matches={matches} onPick={pick} />
      {error && <p className="autherr">{error}</p>}
      <div className="cedit-acts">
        <button
          type="button"
          className="btn sm"
          disabled={saving}
          onClick={() => onEditingChange(false)}
        >
          Cancel
        </button>
        <button type="button" className="btn primary sm" disabled={!draft.trim() || saving} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// The Edit button beside a comment's other actions.
export function EditCommentButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      className={className}
      aria-label="Edit comment"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      Edit
    </button>
  );
}

// A long comment is cut to its first lines with Read More, and Read Less
// once open (direct instruction: a check added as a comment made the box
// too long). Measured as it's shown, so only one that's actually cut off
// gets the button.
function CommentWords({
  body,
  editedAt,
  mentions,
  team,
}: {
  body: string;
  editedAt: string | null | undefined;
  mentions: string[];
  team: TeamMember[];
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [long, setLong] = useState(false);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const measure = () => setLong(el.scrollHeight > el.clientHeight + 1);
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [body, open]);
  const edited = editedAt && (
    <span className="cedited" title={`Edited ${new Date(editedAt).toLocaleString("en-GB")}`}>
      Edited
    </span>
  );
  const cut = long && !open;
  return (
    <>
      <p ref={ref} className={open ? "cbody" : "cbody clamp"}>
        <MentionText text={body} mentions={mentions} team={team} />
        {!cut && edited}
      </p>
      {long && (
        <p className="cmore">
          <button
            type="button"
            aria-expanded={open}
            onClick={(e) => {
              // Not the card's own click, which picks the comment.
              e.stopPropagation();
              setOpen((o) => !o);
            }}
          >
            {open ? "Read Less" : "Read More"}
          </button>
          {cut && edited}
        </p>
      )}
    </>
  );
}
