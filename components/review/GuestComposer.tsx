"use client";

import { useState } from "react";
import type { ReviewController } from "@/hooks/use-review-controller";

// Shared by both the phone and desktop layouts — same state, same
// handlers, only the wrapping markup differs (developer handover, "one
// renderer, two shapes").
export function GuestComposer({
  controller,
  variant,
}: {
  controller: ReviewController;
  variant: "mobile" | "desktop";
}) {
  const { identity, commentDraft, setCommentDraft, postComment, posting, canApprove, approve, approving, active } =
    controller;
  const [name, setName] = useState(identity.name ?? "");
  const [email, setEmail] = useState(identity.email ?? "");
  const [error, setError] = useState<string | null>(null);

  const knowsWho = !!identity.name && !!identity.email;
  const alreadyApproved = !!active?.approved_at;

  async function handlePost() {
    setError(null);
    if (!name.trim() || !email.trim()) {
      setError("Enter your name and email first.");
      return;
    }
    const result = await postComment(name.trim(), email.trim());
    if (result && result.status !== "ok") {
      setError(describeStatus(result.status));
    }
  }

  async function handleApprove() {
    setError(null);
    if (!name.trim() || !email.trim()) {
      setError("Enter your name and email first.");
      return;
    }
    const result = await approve(name.trim(), email.trim());
    if (result && result.status !== "ok") {
      setError(describeStatus(result.status));
    }
  }

  const barClass = variant === "mobile" ? "m-bar" : "dk-foot";
  const inputClass = variant === "mobile" ? "m-in" : "bin";

  return (
    <div className={barClass}>
      {knowsWho ? (
        <div className="m-signedin">
          <span className="av" style={{ background: "var(--action)" }}>
            {name.slice(0, 1).toUpperCase()}
          </span>
          <span>
            Commenting as <b>{identity.name}</b>
          </span>
        </div>
      ) : (
        <div className="field" style={{ marginBottom: 8 }}>
          <div className="frow">
            <input
              className={inputClass}
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className={inputClass}
              placeholder="Your email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>
      )}

      <textarea
        className={inputClass}
        placeholder="Add a comment…"
        rows={2}
        value={commentDraft}
        onChange={(e) => setCommentDraft(e.target.value)}
      />

      {error && (
        <p className="autherr" style={{ marginTop: 6 }}>
          {error}
        </p>
      )}

      <div className="cf" style={{ marginTop: 8 }}>
        <button
          type="button"
          className="btn primary sm"
          disabled={!commentDraft.trim() || posting}
          onClick={handlePost}
        >
          {posting ? "Posting…" : "Post"}
        </button>
      </div>

      {canApprove && active && (
        <div className="m-decide">
          <button
            type="button"
            className="m-ok"
            disabled={approving || alreadyApproved}
            onClick={handleApprove}
          >
            {alreadyApproved
              ? "Approved"
              : approving
                ? "Approving…"
                : "Approve"}
          </button>
        </div>
      )}
    </div>
  );
}

function describeStatus(status: string) {
  switch (status) {
    case "name_required":
      return "Enter your name first.";
    case "body_required":
      return "Write something before posting.";
    case "not_allowed":
      return "This piece isn't part of the shared link.";
    case "passcode_required":
      return "This link needs a passcode.";
    default:
      return "That didn't go through.";
  }
}
