"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { ReviewController } from "@/hooks/use-review-controller";
import { formatVideoTime } from "@/lib/annotations";
import { STAGE } from "@/lib/stage-labels";
import { useRequestSharedAccount, type AccountRequestStatus } from "@/hooks/use-shared-actions";
import { useReviewViewer } from "@/hooks/use-review-viewer";
import { Modal } from "@/components/ui/Modal";
import { MIN_PASSWORD_LENGTH } from "@/lib/invites/constants";

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
  // A Client signed in (back from activating their account, say) is who
  // they are here too: their name is remembered for this client's links.
  const { data: viewer } = useReviewViewer();
  const viewerContact = viewer?.email
    ? contacts.find((c) => c.email.toLowerCase() === viewer.email!.toLowerCase())
    : undefined;
  const setIdentity = identity.setIdentity;
  useEffect(() => {
    if (viewerContact && identity.email?.toLowerCase() !== viewerContact.email.toLowerCase()) {
      setIdentity(viewerContact.name, viewerContact.email);
    }
  }, [viewerContact, identity.email, setIdentity]);
  const clientName =
    controller.data?.status === "ok" ? controller.data.client_name : null;
  const workspaceName =
    controller.data?.status === "ok" ? controller.data.agency_name : null;
  // Whose account Create an account is for: the remembered name, or the one picked.
  const chosenEmail = knowsWho ? identity.email! : pickerValue ? email : null;
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
    // Who's remembered (or signed in) counts over what the box last held.
    const who = knowsWho ? { name: identity.name!, email: identity.email! } : { name, email };
    if (!who.name.trim() || !who.email.trim()) {
      setError("Choose who you are first.");
      return;
    }
    const result = await postComment(who.name.trim(), who.email.trim());
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
    const who = knowsWho ? { name: identity.name!, email: identity.email! } : { name, email };
    if (!who.name.trim() || !who.email.trim()) {
      setError("Choose who you are first.");
      return;
    }
    approvingNow.current = true;
    try {
      const result = await approve(who.name.trim(), who.email.trim());
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
  // Where to do it, in order (direct instruction: make it easy to know what
  // to do and what to skip): pick a name, comment, Approve; then, last and
  // optional, an account. There's no Close: a browser won't let a page
  // close a tab it didn't open, so it did nothing on a link opened from an
  // email or a message (reported directly).
  const account = noOne ? (
    <div className="rv-account">
      <SignInLine />
    </div>
  ) : (
    <AccountLine controller={controller} email={chosenEmail} clientName={clientName} />
  );

  // The client has their say only in Client Review (phase150, direct
  // instruction): a post shared before or after it is theirs to read.
  if (active && active.stage !== STAGE.review) {
    return (
      <div className={barClass}>
        <p className="m-noone">
          {active.stage < STAGE.review
            ? "This post isn't ready for your review yet. You can read it, and comment once it is."
            : alreadyApproved
              ? "This post is approved."
              : "This post has moved on from review."}
        </p>
        {canApprove && alreadyApproved && (
          <div className="m-decide">
            <button type="button" className="m-ok" disabled>
              Approved
            </button>
          </div>
        )}
        {account}
      </div>
    );
  }

  return (
    <div className={barClass}>
      {knowsWho ? (
        <div className="m-signedin">
          <span className="av" style={{ background: "var(--action)" }}>
            {(identity.name ?? "").slice(0, 1).toUpperCase()}
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
      ) : noOne ? (
        <p className="m-noone">
          Only {clientName ?? "the client"}&apos;s people can comment here.
          Ask {workspaceName ?? "the team who sent it"} to add you as a
          Client of {clientName ?? "this client"}.
        </p>
      ) : (
        <>
          {/* The first thing to do. Picking a name is all it takes: no
              account, no sign-in. */}
          <p className="rv-lead">
            Pick your name, then comment{canApprove ? " or approve" : ""}.
          </p>
          <div className="field" style={{ marginBottom: 8 }}>
            <select
              className={inputClass}
              aria-label="Who are you?"
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

      {active && canApprove && (
        <div className="m-decide">
          <button
            type="button"
            className="m-ok"
            disabled={approveDisabled}
            onClick={handleApprove}
          >
            {alreadyApproved ? "Approved" : "Approve"}
          </button>
        </div>
      )}

      {account}
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


// An account, last on the link and never needed (direct instruction: lead
// with what it's for and how, say it's optional, and keep it below
// everything, since it doesn't matter for this feedback). Create an account
// opens a window to choose a password (CreateAccountWindow); a Client
// already signed in sees the way to their planner instead.
function AccountLine({
  controller,
  email,
  clientName,
}: {
  controller: ReviewController;
  email: string | null;
  clientName: string | null;
}) {
  const pathname = usePathname();
  const { data: viewer } = useReviewViewer();
  const [open, setOpen] = useState(false);
  const clientId = controller.data?.status === "ok" ? controller.data.client_id : null;
  const theirs = clientName ? `${clientName}'s` : "your";

  // Back on the link after activating, or signed in some other time
  // (direct instruction: with a link to the planner).
  if (viewer?.signedIn && clientId && viewer.clientIds.includes(clientId)) {
    return (
      <div className="rv-account">
        <p>
          Signed in as {viewer.email}.{" "}
          <a href={`/clients/${clientId}`} style={{ color: "var(--action)" }}>
            See all of {theirs} posts in your content planner
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="rv-account">
      <div className="rv-account-h">Optional</div>
      <p>
        Want all of {theirs} posts in one place?{" "}
        <button type="button" className="rv-linkbtn" onClick={() => setOpen(true)}>
          Create an account
        </button>{" "}
        or{" "}
        <a href={`/login?redirect_to=${encodeURIComponent(pathname)}`} style={{ color: "var(--action)" }}>
          log in
        </a>
        . You don&apos;t need one to comment or approve.
      </p>
      {open && (
        <CreateAccountWindow controller={controller} email={email} back={pathname} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

// Choose a password, then activate from the email (direct instruction). The
// email is the chosen name's own, never typed; with no name picked yet the
// window asks for it first. Someone who already uses Frank keeps their own
// password and only gets the email.
function CreateAccountWindow({
  controller,
  email: givenEmail,
  back,
  onClose,
}: {
  controller: ReviewController;
  email: string | null;
  back: string;
  onClose: () => void;
}) {
  const request = useRequestSharedAccount(controller.token, controller.passcode);
  const workspaceName = controller.data?.status === "ok" ? controller.data.agency_name : null;
  const [pickedEmail, setPickedEmail] = useState("");
  const email = givenEmail ?? (pickedEmail || null);
  // What the server said, for the name it was asked about.
  const [answer, setAnswer] = useState<{ email: string; status: AccountRequestStatus } | null>(null);
  const status = answer && answer.email === email ? answer.status : null;
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // What this person needs, once there's a name (again if it changes).
  const check = request.mutate;
  useEffect(() => {
    if (!email) return;
    check({ email, step: "check" }, { onSuccess: (result) => setAnswer({ email, status: result }) });
  }, [email, check]);

  async function send() {
    if (!email) return;
    setProblem(null);
    if (status === "new") {
      if (password.length < MIN_PASSWORD_LENGTH) return setProblem(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    const result = await request.mutateAsync({ email, step: "send", password: status === "new" ? password : undefined, back });
    if (result === "short_password") return setProblem(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
    setAnswer({ email, status: result });
  }

  const ready = status === "new" || status === "existing";
  const done = status === "sent";
  const stop = status && !ready && !done;
  return (
    <Modal
      title={done ? "Check Your Email" : "Create Your Account"}
      hideCloseButton
      onClose={onClose}
      footer={
        <>
          <div className="grow" />
          {done || stop ? (
            <button type="button" className="btn primary" onClick={onClose}>
              Done
            </button>
          ) : (
            <>
              <button type="button" className="btn" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="btn primary" disabled={!ready || request.isPending} onClick={() => void send()}>
                {request.isPending && ready
                  ? "Creating…"
                  : status === "existing"
                    ? "Email Me a Link"
                    : "Create Account"}
              </button>
            </>
          )}
        </>
      }
    >
      <div className="rv-accountwin">
        {done ? (
          <p className="sub">
            We&apos;ve emailed {email} a link. Open it and log in with{" "}
            {password ? "the password you just chose" : "your usual Frank password"} to activate your account. Your
            feedback here works the same either way.
          </p>
        ) : (
          <>
            <p className="sub">Optional. You don&apos;t need an account to comment or approve.</p>
            {!givenEmail && (
              <div className="field">
                <label htmlFor="rv-acc-who">Who are you?</label>
                <select
                  id="rv-acc-who"
                  className="bin"
                  value={pickedEmail}
                  onChange={(e) => setPickedEmail(e.target.value)}
                >
                  <option value="" disabled>
                    Pick your name
                  </option>
                  {controller.contacts.map((c) => (
                    <option key={c.id} value={c.email}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {email && (
              <div className="field">
                <label htmlFor="rv-acc-email">Email</label>
                <input id="rv-acc-email" className="bin" type="email" value={email} readOnly disabled />
              </div>
            )}
            {status === "new" && (
              <>
                {/* One box (direct instruction), with Show to check it. */}
                <div className="field">
                  <label htmlFor="rv-acc-pw">Password</label>
                  <div className="rv-pwrow">
                    <input
                      id="rv-acc-pw"
                      className="bin"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn sm"
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
                <p className="sub">Then we&apos;ll email you a link to activate it.</p>
              </>
            )}
            {status === "existing" && (
              <p className="sub">
                You already use Frank as {email}. We&apos;ll email you a link; open it and log in with your usual
                password.
              </p>
            )}
            {stop && <p className="sub" role="status">{accountNote(status, email, workspaceName)}</p>}
            {problem && <p className="autherr">{problem}</p>}
          </>
        )}
      </div>
    </Modal>
  );
}

function accountNote(status: AccountRequestStatus, email: string | null, workspaceName: string | null) {
  switch (status) {
    case "already_sent":
      return `We emailed ${email} a link a moment ago. Use that one, or try again in a minute.`;
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
