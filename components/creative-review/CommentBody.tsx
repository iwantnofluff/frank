"use client";

import { useState } from "react";

// A comment's words, and editing them in place when they're the viewer's
// own (direct instruction; phase75). Marked "Edited" once changed. The
// place that shows it owns whether it's being edited, so its Edit button
// can sit wherever that place's other actions are.
export function CommentBody({
  body,
  editedAt,
  editing,
  onEditingChange,
  onSave,
}: {
  body: string;
  editedAt: string | null | undefined;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onSave: (body: string) => Promise<unknown>;
}) {
  if (!editing) {
    return (
      <p>
        {body}
        {editedAt && (
          <span className="cedited" title={`Edited ${new Date(editedAt).toLocaleString()}`}>
            Edited
          </span>
        )}
      </p>
    );
  }
  return <CommentEditor body={body} onEditingChange={onEditingChange} onSave={onSave} />;
}

// Mounted only while editing, so each edit starts from the words as they are.
function CommentEditor({
  body,
  onEditingChange,
  onSave,
}: {
  body: string;
  onEditingChange: (editing: boolean) => void;
  onSave: (body: string) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(body);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const next = draft.trim();
    if (!next) return;
    if (next === body.trim()) return onEditingChange(false);
    setSaving(true);
    setError(null);
    try {
      await onSave(next);
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
        className="bin"
        rows={2}
        aria-label="Edit comment"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onEditingChange(false);
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save();
        }}
      />
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
