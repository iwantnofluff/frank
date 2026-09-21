"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useCreatives } from "@/hooks/use-creatives";
import {
  useCreateSharedLink,
  type SharedLinkScope,
} from "@/hooks/use-create-shared-link";
import { resolveShareEligibility } from "@/lib/shared-link-eligibility";

const SCOPE_OPTIONS: {
  value: SharedLinkScope;
  title: string;
  hint: string;
}[] = [
  {
    value: "pending",
    title: "Everything waiting on them",
    hint: "Whatever is currently in client review",
  },
  {
    value: "all",
    title: "The whole project",
    hint: "Including work already approved or published",
  },
  { value: "one", title: "Just this one", hint: "Only this creative" },
  {
    value: "pick",
    title: "Choose the pieces",
    hint: "Tick the ones to include",
  },
];

export function ShareModal({
  projectId,
  projectName,
  currentCreativeId,
  onClose,
}: {
  projectId: string;
  projectName: string;
  currentCreativeId: string;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<SharedLinkScope>("pending");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [expiresInDays, setExpiresInDays] = useState(14);
  const [passcodeOn, setPasscodeOn] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [canApprove, setCanApprove] = useState(true);
  const [link, setLink] = useState<string | null>(null);

  const { data: creatives } = useCreatives(projectId);
  const createLink = useCreateSharedLink();

  // Client-side preview of shared_link_allowed_creative_ids' stage >= 5
  // rule — not enforcement (the RPC is still the real gate), just telling
  // staff what this link will actually show before they hand it out.
  // Doesn't block creation: there are legitimate reasons to make a link
  // ahead of the work being ready.
  const eligibility = useMemo(
    () =>
      resolveShareEligibility(creatives ?? [], scope, {
        currentCreativeId,
        pickedIds: Array.from(picked),
      }),
    [creatives, scope, currentCreativeId, picked],
  );
  const eligibilityNote = useMemo(() => {
    const { candidateCount, eligibleCount, excludedCount } = eligibility;
    if (candidateCount === 0) {
      // scope "pick" with nothing checked yet already has its own cue
      // (the "0 selected" hint and the disabled Create link button) —
      // nothing more to say here.
      if (scope === "pick") return null;
      return {
        tone: "warn" as const,
        text:
          scope === "pending"
            ? "Nothing is currently waiting on client review in this project."
            : "This project has no creatives yet.",
      };
    }
    if (eligibleCount === 0) {
      return {
        tone: "warn" as const,
        text:
          candidateCount === 1
            ? "This link will show nothing yet — that piece is still in Concept, Copy, Design or Internal QC. Work only becomes visible to a client from Client Review onward."
            : `This link will show nothing yet — all ${candidateCount} pieces it covers are still in Concept, Copy, Design or Internal QC. Work only becomes visible to a client from Client Review onward.`,
      };
    }
    if (excludedCount > 0) {
      return {
        tone: "info" as const,
        text: `${excludedCount} of ${candidateCount} won't show on this link — still in Concept, Copy, Design or Internal QC.`,
      };
    }
    return null;
  }, [eligibility, scope]);

  async function handleCreate() {
    const token = await createLink.mutateAsync({
      projectId,
      scope,
      creativeId: scope === "one" ? currentCreativeId : null,
      pickedCreatives: scope === "pick" ? Array.from(picked) : null,
      expiresInDays,
      passcode: passcodeOn ? passcode : null,
      canApprove,
    });
    setLink(`${window.location.origin}/review/${token}`);
  }

  return (
    <Modal
      title="Share for review"
      onClose={onClose}
      footer={
        <>
          <span className="grow">{projectName}</span>
          {link ? (
            <button type="button" className="btn" onClick={onClose}>
              Done
            </button>
          ) : (
            <button
              type="button"
              className="btn primary"
              disabled={
                createLink.isPending ||
                (scope === "pick" && picked.size === 0) ||
                (passcodeOn && !passcode.trim())
              }
              onClick={handleCreate}
            >
              {createLink.isPending ? "Creating…" : "Create link"}
            </button>
          )}
        </>
      }
    >
      {link ? (
        <div>
          <div className="field">
            <label>Link</label>
            <div className="linkrow">
              <code>{link}</code>
              <button
                type="button"
                className="btn sm"
                onClick={() => navigator.clipboard.writeText(link)}
              >
                Copy
              </button>
            </div>
          </div>
          <p className="sub">
            Anyone with this link can read the work covered by the scope you
            picked. Commenting or approving asks them for a name and email
            first — no account required.
          </p>
        </div>
      ) : (
        <div>
          <div className="field">
            <label>What the link shows</label>
            <div className="radios" role="radiogroup">
              {SCOPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  className="radio"
                  aria-checked={scope === opt.value}
                  onClick={() => setScope(opt.value)}
                >
                  <span className="rd" />
                  <span>
                    <b>{opt.title}</b>
                    <span>{opt.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {scope === "pick" && (
            <div className="field">
              <label>
                Pieces <span className="hint">{picked.size} selected</span>
              </label>
              <div className="picklist2">
                {creatives?.map((c) => (
                  <label className="pk2" key={c.id}>
                    <input
                      type="checkbox"
                      checked={picked.has(c.id)}
                      onChange={(e) => {
                        const next = new Set(picked);
                        if (e.target.checked) next.add(c.id);
                        else next.delete(c.id);
                        setPicked(next);
                      }}
                    />
                    <span className="pn">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="frow">
            <div className="field">
              <label htmlFor="shExp">Link expires</label>
              <select
                id="shExp"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(Number(e.target.value))}
              >
                <option value={7}>In 7 days</option>
                <option value={14}>In 14 days</option>
                <option value={30}>In 30 days</option>
                <option value={0}>Never</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="shCode">Passcode</label>
              <select
                id="shCode"
                value={passcodeOn ? "on" : "off"}
                onChange={(e) => setPasscodeOn(e.target.value === "on")}
              >
                <option value="off">Not required</option>
                <option value="on">Required</option>
              </select>
            </div>
          </div>

          {passcodeOn && (
            <div className="field">
              <label htmlFor="shPasscode">Passcode</label>
              <input
                id="shPasscode"
                type="text"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="What they'll need to type in"
              />
            </div>
          )}

          <div className="srow">
            <span className="sl">
              <b>Let them approve</b>
              <span>
                Not just comment. An approval from the link is recorded
                against whoever gave their name.
              </span>
            </span>
            <button
              type="button"
              className="tog"
              aria-pressed={canApprove}
              onClick={() => setCanApprove(!canApprove)}
            >
              <i />
            </button>
          </div>

          {eligibilityNote && (
            <div className={`note${eligibilityNote.tone === "warn" ? " warn" : ""}`}>
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 16v-5M12 8h.01" />
              </svg>
              <div>{eligibilityNote.text}</div>
            </div>
          )}

          <div className="note">
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 16v-5M12 8h.01" />
            </svg>
            <div>
              Anyone with the link can read the work and every public comment
              on it. Private, internal-only comments never leave the
              building.
            </div>
          </div>

          {createLink.error && (
            <p className="autherr">
              {createLink.error instanceof Error
                ? createLink.error.message
                : "Couldn't create the link"}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
