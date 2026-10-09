"use client";

import { useRef, useState } from "react";
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
  // "" = nothing picked yet, else a client_contacts row's id. Only the
  // client's own people comment (decided directly, phase77; it was a
  // shortcut with "Someone else" before): the list is the whole set, and
  // the database refuses anyone not on it.
  const [pickerValue, setPickerValue] = useState("");

  // A remembered name counts only while it's still on this client's list.
  const knowsWho =
    !!identity.name &&
    !!identity.email &&
    contacts.some(
      (c) => c.email.toLowerCase() === identity.email!.toLowerCase(),
    );
  const noOne = contacts.length === 0;
  const clientName =
    controller.data?.status === "ok" ? controller.data.client_name : null;
  const workspaceName =
    controller.data?.status === "ok" ? controller.data.agency_name : null;
  const alreadyApproved = !!active?.approved_at;
  const approveDisabled = approving || alreadyApproved || noOne;

  function handlePickerChange(value: string) {
    setPickerValue(value);
    const contact = contacts.find((c) => c.id === value);
    if (contact) {
      setName(contact.name);
      setEmail(contact.email);
    }
  }

  async function handlePost() {
    setError(null);
    if (!name.trim() || !email.trim()) {
      setError("Choose who you are first.");
      return;
    }
    const result = await postComment(name.trim(), email.trim());
    if (result && result.status !== "ok") {
      setError(describeStatus(result.status));
    }
  }

  // One approval at a time: a second click before the screen updates is
  // ignored (the database also counts it once, phase53).
  const approvingNow = useRef(false);
  async function handleApprove() {
    if (approvingNow.current) return;
    setError(null);
    if (!name.trim() || !email.trim()) {
      setError("Choose who you are first.");
      return;
    }
    approvingNow.current = true;
    try {
      const result = await approve(name.trim(), email.trim());
      if (result && result.status !== "ok") {
        setError(describeStatus(result.status));
      }
    } catch {
      setError("Couldn't approve it. Try again.");
    } finally {
      approvingNow.current = false;
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
          <button
            type="button"
            className="m-notyou"
            onClick={() => {
              identity.forget();
              setName("");
              setEmail("");
              setPickerValue("");
            }}
          >
            Not you?
          </button>
        </div>
      ) : (
        <>
          {/* A plain link back to the real app — present, never required.
              This page stays fully anonymous either way: picking a name
              below is enough to comment or approve on its own. */}
          <div
            style={{ fontSize: 12.7, color: "var(--muted)", marginBottom: 8 }}
          >
            Have an account?{" "}
            <a href="/login" style={{ color: "var(--action)" }}>
              Log in
            </a>
            .
          </div>

          {noOne ? (
            <p className="m-noone">
              Only {clientName ?? "the client"}&apos;s people can comment here.
              Ask {workspaceName ?? "the team who sent it"} to add you as a
              Client of {clientName ?? "this client"}.
            </p>
          ) : (
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
              </select>
            </div>
          )}
        </>
      )}

      {/* Nobody on the list: nothing to write a comment as, so no box. */}
      {!noOne && (
        <>
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
              onClick={() =>
                controller.setAttachMoment(!controller.attachMoment)
              }
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
              disabled={!commentDraft.trim() || posting || noOne}
              onClick={handlePost}
            >
              {posting ? "Posting…" : "Post"}
            </button>
          </div>
        </>
      )}

      {active && (
        <div className="m-decide">
          {/* Best-effort — a browser only allows a script to close a tab it
              opened itself, so on a tab the guest navigated to directly
              (the normal way a shared link is opened) this can silently
              no-op. There's no reliable way to detect that from here, so
              this stays a plain, un-gated button rather than one that
              claims to have worked. */}
          <button
            type="button"
            className="m-close"
            onClick={() => window.close()}
          >
            Close
          </button>
          {canApprove && (
            <button
              type="button"
              className="m-ok"
              disabled={approveDisabled}
              onClick={handleApprove}
            >
              {alreadyApproved ? "Approved" : "Approve"}
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
    case "not_on_client":
      return "Only the client's own people can comment here. Choose your name from the list.";
    default:
      return "That didn't go through.";
  }
}
