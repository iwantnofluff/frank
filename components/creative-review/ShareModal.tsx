"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useCreatives, type CreativeListRow } from "@/hooks/use-creatives";
import {
  useCreateSharedLink,
  type SharedLinkScope,
} from "@/hooks/use-create-shared-link";
import { resolveShareEligibility } from "@/lib/shared-link-eligibility";
import { errorMessage } from "@/lib/errors";
import { formatById } from "@/lib/formats";

// Only the two scopes this modal itself ever sets — "pending"/"all" are
// still real, valid SharedLinkScope values (existing shared_links rows can
// carry either, and create_shared_link still accepts them), just not
// choices offered here any more.
const SCOPE_OPTIONS: {
  value: SharedLinkScope;
  title: string;
  hint: string;
}[] = [
  { value: "one", title: "Current Post", hint: "Only this creative" },
  {
    value: "pick",
    title: "Multiple Posts",
    hint: "Choose which posts to include",
  },
];

// "W:H" (lib/formats.ts's own FormatDefinition.aspectRatio) -> a CSS
// aspect-ratio value. A handful of formats carry "multi" or "—" instead of
// a real ratio (Google Display's multi-size set, SMS/email's own no-image
// formats) — Instagram Feed's own 4:5 is the safest fallback for those,
// and matches what "look like an Instagram feed" asked for by default.
function aspectRatioCss(ratio: string | undefined): string {
  const match = ratio?.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  return match ? `${match[1]} / ${match[2]}` : "4 / 5";
}

// Same hash-to-hue trick as CreativePreviewPopover's own PlaceholderArt —
// a decorative gradient standing in for the real artwork, since fetching a
// signed thumbnail URL per creative just to render a picker grid would mean
// one storage round-trip per piece in the project. Duplicated rather than
// shared: that component's own overlay is always-on (a hover popover has
// no "hover" state of its own to gate it), this tile's is hover-only.
function hashString(s: string) {
  let n = 0;
  for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0;
  return n;
}

function PieceTile({
  creative,
  selected,
  selectable,
  onToggle,
}: {
  creative: CreativeListRow;
  selected: boolean;
  // False under scope "one" — the grid still shows every piece so the
  // current one's selection reads in context, but only "Multiple Posts"
  // lets you click a different tile.
  selectable: boolean;
  onToggle: () => void;
}) {
  const hue = hashString(creative.id) % 360;
  const gradientId = `pk-${creative.id}`;
  const ratio = aspectRatioCss(formatById(creative.format)?.aspectRatio);
  return (
    <button
      type="button"
      className={`pktile${selected ? " selected" : ""}${!selectable ? " locked" : ""}`}
      style={{ aspectRatio: ratio }}
      aria-pressed={selected}
      onClick={selectable ? onToggle : undefined}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={`hsl(${hue}, 55%, 24%)`} />
            <stop offset="1" stopColor={`hsl(${hue}, 55%, 12%)`} />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill={`url(#${gradientId})`} />
      </svg>
      <span className="pktile-check">
        <svg viewBox="0 0 24 24">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </span>
      <span className="pktile-title">{creative.name}</span>
    </button>
  );
}

export function ShareModal({
  projectId,
  currentCreativeId,
  onClose,
}: {
  projectId: string;
  currentCreativeId: string;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<SharedLinkScope>("one");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [expiresInDays, setExpiresInDays] = useState(14);
  const [passcodeOn, setPasscodeOn] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [canApprove, setCanApprove] = useState(true);
  const [link, setLink] = useState<string | null>(null);

  const { data: creatives } = useCreatives(projectId);
  const createLink = useCreateSharedLink();

  // What the grid actually shows as checked — "one" always reads as just
  // the current piece, regardless of whatever "pick" selection is sitting
  // in state from a previous toggle back and forth.
  const selectedIds = scope === "one" ? new Set([currentCreativeId]) : picked;

  function toggleScope(value: SharedLinkScope) {
    setScope(value);
    // Switching into "Multiple Posts" starts from the piece already being
    // viewed rather than an empty grid — "allowed to select more" implies
    // adding to what's already selected, not starting over.
    if (value === "pick" && picked.size === 0) {
      setPicked(new Set([currentCreativeId]));
    }
  }

  function togglePiece(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Client-side preview of shared_link_allowed_creative_ids' stage >= 3
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
    // "pick" with nothing checked yet already has its own cue (the "0
    // selected" hint and the disabled Create link button).
    if (scope === "pick" && candidateCount === 0) return null;
    if (eligibleCount === 0) {
      return {
        tone: "warn" as const,
        text:
          candidateCount === 1
            ? "This link will show nothing yet — that post is still in Concept or Internal Review. Move it to Client Review (on its own page) to make it visible here."
            : `This link will show nothing yet — all ${candidateCount} posts it covers are still in Concept or Internal Review. Move them to Client Review (on their own page) to make them visible here.`,
      };
    }
    if (excludedCount > 0) {
      return {
        tone: "info" as const,
        text: `${excludedCount} of ${candidateCount} won't show on this link — still in Concept or Internal Review. Move them to Client Review to include them.`,
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
          <div className="grow" />
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
        <>
          <div className="msection-h">Link</div>
          <p className="msection-d">Ready to send — anyone with it can open the work it covers.</p>
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
        </>
      ) : (
        <>
          <div className="msection-h">Share</div>
          <p className="msection-d">Choose whether this link covers just the post you&rsquo;re viewing, or several.</p>
          <div className="field">
            <div className="radios" role="radiogroup">
              {SCOPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  className="radio"
                  aria-checked={scope === opt.value}
                  onClick={() => toggleScope(opt.value)}
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

          <div className="msection-h">Posts</div>
          <p className="msection-d">
            {scope === "one"
              ? "Only the post you're viewing is included on this link."
              : `${picked.size} selected — click a post to add or remove it.`}
          </p>
          <div className="pkgrid">
            {creatives?.map((c) => (
              <PieceTile
                key={c.id}
                creative={c}
                selected={selectedIds.has(c.id)}
                selectable={scope === "pick"}
                onToggle={() => togglePiece(c.id)}
              />
            ))}
          </div>
          {eligibilityNote && (
            <div className={`note${eligibilityNote.tone === "warn" ? " warn" : ""}`} style={{ marginTop: 14 }}>
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 16v-5M12 8h.01" />
              </svg>
              <div>{eligibilityNote.text}</div>
            </div>
          )}

          <div className="msection-h">Link settings</div>
          <p className="msection-d">How long it lasts, whether it needs a passcode, and what they can do with it.</p>

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

          <div className="note" style={{ marginTop: 16 }}>
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
            <p className="autherr">{errorMessage(createLink.error, "Couldn't create the link")}</p>
          )}
        </>
      )}
    </Modal>
  );
}
