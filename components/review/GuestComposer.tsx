"use client";

import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { ReviewController } from "@/hooks/use-review-controller";
import { formatVideoTime } from "@/lib/annotations";
import { STAGE } from "@/lib/stage-labels";
import { useRequestSharedAccount, type AccountRequestStatus } from "@/hooks/use-shared-actions";

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
  // Whose account Create an account is for: the remembered name, or the one picked.
  const chosenEmail = knowsWho ? identity.email! : pickerValue ? email : null;
  const accountLine = noOne ? (
    <SignInLine />
  ) : (
    <AccountLine controller={controller} email={chosenEmail} clientName={clientName} workspaceName={workspaceName} />
  );
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

  // The client has their say only in Client Review (phase150, direct
  // instruction): a post shared before or after it is theirs to read.
  if (active && active.stage !== STAGE.review) {
    return (
      <div className={barClass}>
        {accountLine}
        <p className="m-noone">
          {active.stage < STAGE.review
            ? "This post isn't ready for your review yet. You can read it, and comment once it is."
            : alreadyApproved
              ? "This post is approved."
              : "This post has moved on from review."}
        </p>
        <div className="m-decide">
          <button type="button" className="m-close" onClick={() => window.close()}>
            Close
          </button>
          {canApprove && alreadyApproved && (
            <button type="button" className="m-ok" disabled>
              Approved
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={barClass}>
      {knowsWho ? (
        <>
          {accountLine}
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
        </>
      ) : (
        <>
          {/* Signing in or creating an account — offered, never required.
              This page stays fully anonymous either way: picking a name
              below is enough to comment or approve on its own. */}
          {accountLine}

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
    case "not_at_review":
      return "This post isn't in review any more, so it can't take comments.";
    case "not_on_client":
      return "Only the client's own people can comment here. Choose your name from the list.";
    default:
      return "That didn't go through.";
  }
}

// An account, offered on every state of the link and never needed (direct
// instruction: the client should know it's optional and changes nothing
// about giving feedback). Create an account emails the chosen name a fresh
// invite to their own address; nothing is shown that would let someone
// else in.
function AccountLine({
  controller,
  email,
  clientName,
  workspaceName,
}: {
  controller: ReviewController;
  email: string | null;
  clientName: string | null;
  workspaceName: string | null;
}) {
  const pathname = usePathname();
  const request = useRequestSharedAccount(controller.token, controller.passcode);
  const [asked, setAsked] = useState<{ status: AccountRequestStatus | "no_name"; email: string | null } | null>(null);
  const logIn = (
    <a href={`/login?redirect_to=${encodeURIComponent(pathname)}`} style={{ color: "var(--action)" }}>
      log in
    </a>
  );
  // The answer is for the name it was asked for; picking another starts again.
  const result = asked && (asked.status === "no_name" ? !email : asked.email === email) ? asked.status : null;

  async function create() {
    if (!email) {
      setAsked({ status: "no_name", email: null });
      return;
    }
    const status = await request.mutateAsync(email);
    setAsked({ status, email });
  }

  return (
    <div className="rv-signin">
      An account is optional and doesn&apos;t change how you give feedback here.{" "}
      <button type="button" className="rv-linkbtn" disabled={request.isPending} onClick={() => void create()}>
        {request.isPending ? "Sending…" : "Create an account"}
      </button>{" "}
      to see all of {clientName ? `${clientName}'s` : "your"} posts in one place, or {logIn}.
      {result && (
        <div className="rv-accountnote" role="status">
          {accountNote(result, email, workspaceName)}
        </div>
      )}
    </div>
  );
}

function accountNote(status: AccountRequestStatus | "no_name", email: string | null, workspaceName: string | null) {
  switch (status) {
    case "no_name":
      return "Choose your name first, then Create an account.";
    case "sent":
      return `We've emailed ${email} a link to set up your account. Your feedback here works the same either way.`;
    case "already_sent":
      return `We've just emailed ${email} a link to set up your account. Check your inbox.`;
    case "has_account":
      return "You already have an account. Log in to see everything in one place.";
    case "not_invited":
      return `Ask ${workspaceName ?? "the team who sent this"} to invite you, then you can create an account.`;
    default:
      return "That didn't go through. Try again in a moment.";
  }
}

// Signing in, offered in every state of the link (direct instruction: a
// teammate sent a link had no way in), and back to this link after: the
// team comments here as themselves (TeamComments); a client signed in has
// their say only in Client Review, as before.
function SignInLine() {
  const pathname = usePathname();
  return (
    <div className="rv-signin">
      Have an account?{" "}
      <a href={`/login?redirect_to=${encodeURIComponent(pathname)}`} style={{ color: "var(--action)" }}>
        Log in
      </a>
      .
    </div>
  );
}
