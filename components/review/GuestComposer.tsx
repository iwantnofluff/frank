"use client";

import { useState } from "react";
import type { ReviewController } from "@/hooks/use-review-controller";
import { formatVideoTime } from "@/lib/annotations";

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
  const {
    identity,
    commentDraft,
    setCommentDraft,
    postComment,
    posting,
    canApprove,
    approve,
    approving,
    active,
    contacts,
  } = controller;
  const [name, setName] = useState(identity.name ?? "");
  const [email, setEmail] = useState(identity.email ?? "");
  const [error, setError] = useState<string | null>(null);
  // "" = nothing picked yet, "other" = the free-text fallback, anything
  // else = a client_contacts row's id. Confirmed with the user directly:
  // the list is a shortcut, never a closed set — "Someone else" always
  // stays available for a real contact who hasn't been added yet.
  const [pickerValue, setPickerValue] = useState("");

  const knowsWho = !!identity.name && !!identity.email;
  const alreadyApproved = !!active?.approved_at;
  const showFreeTextInputs = contacts.length === 0 || pickerValue === "other";
  const approveDisabled = approving || alreadyApproved;

  function handlePickerChange(value: string) {
    setPickerValue(value);
    if (value === "other") {
      setName("");
      setEmail("");
      return;
    }
    const contact = contacts.find((c) => c.id === value);
    if (contact) {
      setName(contact.name);
      setEmail(contact.email);
    }
  }

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
        <>
          {/* A plain link back to the real app — present, never required.
              This page stays fully anonymous either way: picking a name (or
              typing one) below is enough to comment or approve on its own. */}
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 8 }}>
            Have an account?{" "}
            <a href="/login" style={{ color: "var(--action)" }}>
              Log in
            </a>
            .
          </div>

          {contacts.length > 0 && (
            <div className="field" style={{ marginBottom: 8 }}>
              <select
                className={inputClass}
                value={pickerValue}
                onChange={(e) => handlePickerChange(e.target.value)}
              >
                <option value="" disabled>
                  Who are you?
                </option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="other">Someone else</option>
              </select>
            </div>
          )}

          {showFreeTextInputs && (
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
        </>
      )}

      <textarea
        className={inputClass}
        placeholder="Add a comment…"
        rows={2}
        value={commentDraft}
        onChange={(e) => setCommentDraft(e.target.value)}
      />
      {/* A video paused at a moment: the comment is attached to it (phase34). */}
      {controller.videoMoment !== null && (
        <button
          type="button"
          className="atchip"
          aria-pressed={controller.attachMoment}
          onClick={() => controller.setAttachMoment(!controller.attachMoment)}
        >
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          {controller.attachMoment
            ? `At ${formatVideoTime(controller.videoMoment)}`
            : `Not at ${formatVideoTime(controller.videoMoment)}`}
        </button>
      )}

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

      {active && (
        <div className="m-decide">
          {/* Best-effort — a browser only allows a script to close a tab it
              opened itself, so on a tab the guest navigated to directly
              (the normal way a shared link is opened) this can silently
              no-op. There's no reliable way to detect that from here, so
              this stays a plain, un-gated button rather than one that
              claims to have worked. */}
          <button type="button" className="m-close" onClick={() => window.close()}>
            Close
          </button>
          {canApprove && (
            <button
              type="button"
              className="m-ok"
              disabled={approveDisabled}
              onClick={handleApprove}
            >
              {alreadyApproved ? "Approved" : approving ? "Approving…" : "Approve"}
            </button>
          )}
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
