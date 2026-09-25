"use client";

import { useState } from "react";

// Shared by AnnotationLayer.tsx (pin/region) and CaptionHighlighter.tsx
// (text selection) — both used to have their own near-identical inline
// form with no visibility control at all, silently posting private
// regardless of what the author might have wanted. Same Public/Private
// wording and staff-only gating as CommentsPanel.tsx's own Composer —
// a non-staff session never sees the toggle at all, since the DB's
// enforce_comment_visibility trigger would just force it back to public
// regardless of what was picked (supabase/seed.sql).
export function CommentDraftForm({
  onCancel,
  onSubmit,
  showVisibilityToggle,
  placeholder = "Add a comment…",
}: {
  onCancel: () => void;
  onSubmit: (body: string, visibility: "private" | "public") => void;
  showVisibilityToggle: boolean;
  placeholder?: string;
}) {
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(true);
  const visibility: "private" | "public" =
    showVisibilityToggle && internal ? "private" : "public";

  return (
    <>
      <textarea
        className="bin"
        rows={2}
        autoFocus
        placeholder={placeholder}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="cf">
        {showVisibilityToggle && (
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
            {internal ? "Private" : "Public"}
          </label>
        )}
        <div className="grow" />
        <button type="button" className="btn sm" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn primary sm"
          disabled={!body.trim()}
          onClick={() => onSubmit(body.trim(), visibility)}
        >
          Post
        </button>
      </div>
    </>
  );
}
