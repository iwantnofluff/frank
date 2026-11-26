"use client";

import { canApproveConcept, useApproveConcept } from "@/hooks/use-approve-concept";
import { useCreativeVersions } from "@/hooks/use-creative-versions";
import { useCopyVersions } from "@/hooks/use-copy-versions";
import { useProductionVersions, type ProductionVersion } from "@/hooks/use-production-versions";
import { useProjectSlack, useSlackConnection } from "@/hooks/use-slack";
import { COPY_FIELD_LABELS } from "@/lib/formats";
import { errorMessage } from "@/lib/errors";
import { CommentWhen } from "./CommentWhen";
import { CommentBody, EditCommentButton } from "./CommentBody";
import { useEffect, useMemo, useState } from "react";
import { CLIENT_SOURCES, viaText } from "@/lib/comment-for-client";
import { formatWhen, initialsOf } from "@/lib/comment-display";
import { useProjectTeam, type TeamMember } from "@/hooks/use-project-discussion";
import { MentionPicker, useMentions } from "@/components/ui/mentions";
import { avatarColour } from "@/lib/avatar-colour";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { useAvatarUrls } from "@/hooks/use-avatar-urls";
import { useCreative } from "@/hooks/use-creative";
import { useMyMembership } from "@/hooks/use-my-membership";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useComments, type CommentRow } from "@/hooks/use-comments";
import { useCreateComment } from "@/hooks/use-create-comment";
import { useToggleCommentResolved } from "@/hooks/use-toggle-comment-resolved";
import { useEditComment } from "@/hooks/use-edit-comment";
import { useDeleteComment } from "@/hooks/use-delete-comment";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToggleCommentVisibility } from "@/hooks/use-toggle-comment-visibility";
import {
  commentTime,
  formatVideoTime,
  isHighlightAnchor,
  isPinAnchor,
  isRegionAnchor,
  isTimeAnchor,
  type CommentDraft,
} from "@/lib/annotations";
import type { ToolMode } from "@/components/creative-review/AnnotationLayer";

// A comment made at a moment in a video shows that moment ("0:12").
function TimeBadge({ anchor }: { anchor: CommentRow["anchor"] }) {
  const t = commentTime(anchor);
  if (t === null) return null;
  return (
    <span className="anchor time-a">
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      {formatVideoTime(t)}
    </span>
  );
}

function AnchorBadge({ anchor }: { anchor: CommentRow["anchor"] }) {
  if (isTimeAnchor(anchor)) return <TimeBadge anchor={anchor} />;
  if (isPinAnchor(anchor)) {
    return (
      <span className="anchor pin-a">
        <svg viewBox="0 0 24 24">
          <path d="M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11z" />
        </svg>
        Pin {anchor.n}
        {commentTime(anchor) !== null && <> · {formatVideoTime(commentTime(anchor)!)}</>}
      </span>
    );
  }
  if (isRegionAnchor(anchor)) {
    return (
      <span className="anchor pin-a">
        <svg viewBox="0 0 24 24">
          <rect x="3.5" y="3.5" width="17" height="17" rx="2" strokeDasharray="4 3" />
        </svg>
        Region {anchor.n}
        {commentTime(anchor) !== null && <> · {formatVideoTime(commentTime(anchor)!)}</>}
      </span>
    );
  }
  if (isHighlightAnchor(anchor)) {
    // Text on Image's words (shown where the artwork goes until there is
    // some) say so, and which slide.
    const slide = (anchor as { slide?: number }).slide;
    return (
      <span className="anchor hl-a">
        {anchor.field === "slide_text" && <>Text on Image{slide ? `, Slide ${slide}` : ""}: </>}
        {anchor.field === "voiceover" && <>VO: </>}
        &ldquo;{anchor.quote}&rdquo;
      </span>
    );
  }
  return null;
}

// The version a comment was made on, and whether it's earlier than the newest.
interface VersionTag {
  label: string;
  old: boolean;
  // Every version it was made on, for its tooltip: "Creative V2 and Copy V1".
  named: string;
}

type Filter = "all" | "unresolved" | "resolved" | "mine" | "internal";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unresolved", label: "Unresolved" },
  { key: "resolved", label: "Resolved" },
  { key: "mine", label: "Mine" },
  { key: "internal", label: "Private" },
];


interface ComposerSlack {
  channel: string;
  teamComments: boolean;
  includePrivate: boolean;
  clientActivity: boolean;
}

function Composer({
  onSubmit,
  showInternalToggle,
  lockedPrivate,
  placeholder,
  autoFocus,
  submitLabel = "Post",
  moment = null,
  beside,
  team = [],
  draft = null,
  onClearDraft,
  clientName = null,
  slack = null,
  asked = false,
}: {
  // Opened from the table's Add Feedback (direct instruction): the box
  // focused.
  asked?: boolean;
  // The project's Slack channel and what it's sent, for the team's tick
  // (phase162); none without one, or for a client.
  slack?: ComposerSlack | null;
  // A pin, area or words placed (direct instruction: they come here to be
  // commented on), shown above the box with a way to take it off.
  draft?: CommentDraft | null;
  onClearDraft?: () => void;
  // For the team: the client's name, to log what the client said outside
  // Frank on their behalf (phase149). None for a client.
  clientName?: string | null;
  // The project's team, offered on @ (phase138); none for a client.
  team?: TeamMember[];
  // Another action beside Post (Approve Concept, phase115).
  beside?: React.ReactNode;
  // A video paused at this moment: the comment is attached to it unless
  // the chip is turned off. Receives the moment it was posted at, or null.
  moment?: number | null;
  onSubmit: (
    body: string,
    visibility: "private" | "public",
    at: number | null,
    mentions: string[],
    // Logged for the client, and where they said it (phase149).
    client: { source: string | null } | null,
    // Sent to Slack (phase162).
    sendToSlack: boolean,
  ) => Promise<unknown>;
  showInternalToggle: boolean;
  lockedPrivate?: boolean;
  placeholder: string;
  autoFocus?: boolean;
  submitLabel?: string;
}) {
  const { text: body, box, matches, onChange, pick, mentionsIn, reset, closePicker } = useMentions(team);
  const [internal, setInternal] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [atMoment, setAtMoment] = useState(true);
  const [forClient, setForClient] = useState(false);
  const [source, setSource] = useState("");
  // Sent to Slack, ticked as it starts (phase162).
  const [slackOn, setSlackOn] = useState(true);

  // Asked for from the table: into the box once, ready to type.
  useEffect(() => {
    if (!asked) return;
    box.current?.focus();
    box.current?.scrollIntoView({ block: "nearest" });
  }, [asked, box]);

  // Placed: straight into the box to say what it's about.
  useEffect(() => {
    if (draft) box.current?.focus();
  }, [draft, box]);

  // Without the Private switch (a client), a comment is public, as the
  // database makes it; its placeholder shouldn't say Private meanwhile.
  // Words of the VO picked: Private, always (phase152), the VO being
  // the team's only.
  const onVo = !!draft && isHighlightAnchor(draft.anchor) && draft.anchor.field === "voiceover";
  const visibility: "private" | "public" = lockedPrivate || onVo
    ? "private"
    : showInternalToggle && internal
      ? "private"
      : "public";

  // Whether the project's Slack settings would send this one: only then is
  // there a tick, which can keep it out (direct instruction, phase162).
  const slackWould =
    !!slack && (clientName && forClient ? slack.clientActivity : slack.teamComments && (visibility === "public" || slack.includePrivate));

  async function handleSubmit() {
    if (!body.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(
        body.trim(),
        visibility,
        moment !== null && atMoment && !draft ? moment : null,
        mentionsIn(body.trim()),
        clientName && forClient ? { source: source || null } : null,
        slackWould ? slackOn : true,
      );
      reset();
      setSlackOn(true);
      // Back to the team's own comment: Private again, as it starts.
      if (forClient) setInternal(true);
      setForClient(false);
      setSource("");
    } catch (err) {
      // The database's own reason too (a Supabase error isn't an Error), not
      // only the fallback, so a refusal says why.
      setError(errorMessage(err, "Couldn't post that comment"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="composer">
      {draft && (
        <div className="cdraft">
          <AnchorBadge anchor={draft.anchor} />
          <button type="button" className="cdraft-x" aria-label="Remove it" title="Remove it" onClick={onClearDraft}>
            <svg viewBox="0 0 24 24">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      )}
      <textarea
        ref={box}
        className="bin"
        rows={2}
        placeholder={draft ? "Say what this is about…" : placeholder}
        value={body}
        onChange={(e) => onChange(e.target.value, e.target.selectionStart)}
        onKeyDown={(e) => {
          if (e.key === "Escape") closePicker();
        }}
        autoFocus={autoFocus}
      />
      <MentionPicker matches={matches} onPick={pick} />
      {moment !== null && !draft && (
        <button
          type="button"
          className="atchip"
          aria-pressed={atMoment}
          title={atMoment ? "Attached to this moment — click to post without it" : "Click to attach to this moment"}
          onClick={() => setAtMoment((v) => !v)}
        >
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          {atMoment ? `At ${formatVideoTime(moment)}` : `Not at ${formatVideoTime(moment)}`}
        </button>
      )}
      {/* The options in a row, wrapping in a narrow panel, then Approve
          Concept and Post on their own line, at the left (direct
          instruction). */}
      <div className="cf opts">
        {onVo && showInternalToggle ? (
          <span className="intog">Private (the VO is for your team only)</span>
        ) : showInternalToggle && !lockedPrivate ? (
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
            Private
          </label>
        ) : lockedPrivate ? (
          <span className="intog">Private (replying to a private comment)</span>
        ) : null}
        {slackWould && (
          <label className="intog" title={`Also post it to #${slack!.channel} in Slack`}>
            <input type="checkbox" checked={slackOn} onChange={(e) => setSlackOn(e.target.checked)} />
            Slack
          </label>
        )}
        {clientName && !onVo && (
          // On behalf and its Source wrap as one (direct instruction: below
          // the others when a long name won't fit beside them).
          <span className="cf-behalf">
            <label className="intog">
            <input
              type="checkbox"
              checked={forClient}
              onChange={(e) => {
                setForClient(e.target.checked);
                // The client's words: public, so they see it was heard.
                if (e.target.checked) setInternal(false);
              }}
            />
            On behalf of {clientName}
          </label>
          {forClient && (
            <span className="vsel">
              <select aria-label="Where the client said it" value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="">Source</option>
                {CLIENT_SOURCES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </span>
          )}
          </span>
        )}
        <div className="grow" />
        {/* Approve Concept and Post together (direct instruction). */}
        <span className="cf-send">
          {beside}
          <button
            type="button"
            className="btn primary sm"
            disabled={!body.trim() || submitting}
            onClick={handleSubmit}
          >
            {submitting ? "Posting…" : submitLabel}
          </button>
        </span>
      </div>
      {error && <p className="autherr">{error}</p>}
    </div>
  );
}

// Staff-only, always shown (not just when private) — flips the comment's
// visibility on click. Clients never see this control: the enforcement
// trigger would just silently revert their attempt to public anyway
// (enforce_comment_visibility, supabase/seed.sql), so offering it would
// be confusing, not useful. A static "Private" label (unchanged from
// before) is still shown to a client viewer when a comment is private.
function VisibilityTag({
  visibility,
  isStaff,
  onToggle,
  fixed = false,
}: {
  visibility: "private" | "public";
  isStaff: boolean;
  onToggle: () => void;
  // On the VO's words: Private for good (phase152); and while its thread is
  // resolved, a label only (direct instruction: only Reopen is clickable).
  fixed?: boolean;
}) {
  const visClass = `vis-tag ${visibility === "private" ? "vis-private" : "vis-public"}`;
  if (!isStaff || fixed) {
    return visibility === "private" ? <span className={visClass}>Private</span> : null;
  }
  return (
    <button
      type="button"
      className={`${visClass} vistoggle`}
      title={`Click to make ${visibility === "private" ? "public" : "private"}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      {visibility === "private" ? "Private" : "Public"}
    </button>
  );
}

// "(No Fluff)" or "(Casa Carigar)" after a name: whose side it's from.
function FromName({ name }: { name: string | null }) {
  return name ? <span className="cmt-from"> ({name})</span> : null;
}

// Who a comment shows as: its author, or for one logged for the client
// (phase149) the client, "via" its author.
function shownAs(c: CommentRow, fromName: (c: CommentRow) => string | null) {
  const author = c.author?.name ?? c.guest_name ?? "Someone";
  return c.for_client
    ? { name: fromName(c) ?? "The client", after: <span className="cmt-from"> {viaText(author, c.client_source)}</span>, photo: false }
    : { name: author, after: <FromName name={fromName(c)} />, photo: !!c.author?.avatar_asset_id };
}

function CommentCard({
  thread,
  replies,
  isStaff,
  currentUserId,
  isHighlighted,
  onSelect,
  selectable = false,
  onReply,
  onToggleResolved,
  onToggleVisibility,
  onEdit,
  onDelete,
  photos,
  fromName,
  versionTag = null,
  clientName,
  team,
  slack = null,
}: {
  // The project's team, for @mentions; empty for a client.
  team: TeamMember[];
  // The project's Slack, for a reply's tick (phase162).
  slack?: ComposerSlack | null;
  thread: CommentRow;
  replies: CommentRow[];
  isStaff: boolean;
  currentUserId: string | undefined;
  isHighlighted: boolean;
  onSelect: () => void;
  // Picked by a click: pinned, on words, or made on another version.
  selectable?: boolean;
  onReply: (
    body: string,
    visibility: "private" | "public",
    mentions: string[],
    client: { source: string | null } | null,
    sendToSlack: boolean,
  ) => Promise<unknown>;
  onToggleResolved: (resolve: boolean) => void;
  onToggleVisibility: (commentId: string, next: "private" | "public") => void;
  // Your own comment's new words (phase75).
  onEdit: (commentId: string, body: string, mentions?: string[]) => Promise<unknown>;
  // Owners and the Primary Owner (phase97): asks first; a thread's
  // replies go with it.
  onDelete?: (comment: CommentRow, replyCount: number) => void;
  photos: Record<string, string> | undefined;
  // The agency's or the client's name, for after a comment's author.
  fromName: (c: CommentRow) => string | null;
  // Made on an earlier version: which (direct instruction), after the pill.
  versionTag?: VersionTag | null;
  // For the team, to log a reply the client gave outside Frank.
  clientName: string | null;
}) {
  const [replying, setReplying] = useState(false);
  // Which of the thread's comments (it, or a reply) is being edited.
  const [editingId, setEditingId] = useState<string | null>(null);
  const who = shownAs(thread, fromName);
  const authorName = who.name;
  // comments_update_own (supabase/seed.sql) allows author_id = auth.uid()
  // or is_agency_staff — authorship, not role. A client resolving/
  // reopening a thread they started themselves succeeds at the database
  // layer (verified empirically); isStaff alone was stricter than that,
  // and stricter than the prototype, which only gates the Make
  // Public/Private toggle behind MODE==="client", not Resolve/Reopen.
  const canResolve = isStaff || thread.author_id === currentUserId;
  // Shown the moment it's posted, before the save is back (useCreateComment):
  // nothing to reply to or resolve yet.
  const pending = thread.id.startsWith("pending-");
  // On the VO's words: it and its replies stay Private (phase152).
  const onVoThread = isHighlightAnchor(thread.anchor) && thread.anchor.field === "voiceover";

  return (
    <div
      id={`cmt-${thread.id}`}
      className={`cmt${thread.resolved_at ? " resolved" : ""}${isHighlighted ? " act" : ""}${thread.visibility === "private" ? " internal" : ""}${pending ? " pending" : ""}`}
      onClick={thread.anchor || selectable ? onSelect : undefined}
      style={thread.anchor || selectable ? { cursor: "pointer" } : undefined}
    >
      <div className="cmt-h">
        <PersonAvatar
          className="who"
          style={{ background: avatarColour(authorName) }}
          initials={initialsOf(authorName)}
          photoUrl={who.photo && thread.author?.avatar_asset_id ? photos?.[thread.author.avatar_asset_id] : null}
          hasPhoto={who.photo}
        />
        <b>
          {authorName}
          {who.after}
        </b>
        <CommentWhen iso={thread.created_at} date={formatWhen(thread.created_at)} />
      </div>
      {thread.anchor && <AnchorBadge anchor={thread.anchor} />}
      <CommentBody
        body={thread.body}
        editedAt={thread.edited_at}
        editing={editingId === thread.id}
        onEditingChange={(on) => setEditingId(on ? thread.id : null)}
        onSave={(body, mentions) => onEdit(thread.id, body, mentions)}
        mentions={thread.mentions}
        team={team}
      />

      {/* Public or Private at the left, Reply first of the actions on the
          right (direct instruction). */}
      <div className="cmt-f">
        <VisibilityTag
          visibility={thread.visibility}
          isStaff={isStaff}
          fixed={onVoThread || !!thread.resolved_at}
          onToggle={() =>
            onToggleVisibility(thread.id, thread.visibility === "private" ? "public" : "private")
          }
        />
        {versionTag && (
          <span
            className={versionTag.old ? "vtag vtag-old" : "vtag"}
            title={`Made on ${versionTag.named}${versionTag.old ? ", an earlier version" : ""}`}
          >
            {versionTag.label}
          </span>
        )}
        {/* Resolved: Reopen alone, in ink, not faded with the rest
            (direct instruction). */}
        {!pending && thread.resolved_at && canResolve && (
          <div className="acts">
            <button type="button" className="reopen" onClick={() => onToggleResolved(false)}>
              Reopen
            </button>
          </div>
        )}
        {!pending && !thread.resolved_at && <div className="acts">
          <button type="button" onClick={() => setReplying(!replying)}>
            Reply
          </button>
          {thread.author_id === currentUserId && editingId !== thread.id && (
            <EditCommentButton onClick={() => setEditingId(thread.id)} />
          )}
          {canResolve && (
            <button type="button" onClick={() => onToggleResolved(true)}>
              Resolve
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              aria-label="Delete comment"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(thread, replies.length);
              }}
            >
              Delete
            </button>
          )}
        </div>}
      </div>

      {replies.length > 0 && (
        <div className="replies">
          {replies.map((r) => {
            const replyWho = shownAs(r, fromName);
            const replyAuthor = replyWho.name;
            return (
              <div className="reply" key={r.id}>
                <PersonAvatar
                  className="who"
                  style={{ background: avatarColour(replyAuthor) }}
                  initials={initialsOf(replyAuthor)}
                  photoUrl={replyWho.photo && r.author?.avatar_asset_id ? photos?.[r.author.avatar_asset_id] : null}
                  hasPhoto={replyWho.photo}
                />
                <div className="rb">
                  <b>
                    {replyAuthor}
                    {replyWho.after}
                  </b>
                  <VisibilityTag
                    visibility={r.visibility}
                    fixed={onVoThread || !!thread.resolved_at}
                    isStaff={isStaff}
                    onToggle={() =>
                      onToggleVisibility(r.id, r.visibility === "private" ? "public" : "private")
                    }
                  />
                  <CommentBody
                    body={r.body}
                    editedAt={r.edited_at}
                    editing={editingId === r.id}
                    onEditingChange={(on) => setEditingId(on ? r.id : null)}
                    onSave={(body, mentions) => onEdit(r.id, body, mentions)}
                    mentions={r.mentions}
                    team={team}
                  />
                  {/* At the right, spaced as the comment's own (direct
                      instruction); none while the thread is resolved:
                      Reopen brings them back. */}
                  {!thread.resolved_at && !r.id.startsWith("pending-") && (r.author_id === currentUserId || onDelete) && (
                    <div className="reply-acts">
                      {r.author_id === currentUserId && editingId !== r.id && (
                        <EditCommentButton onClick={() => setEditingId(r.id)} />
                      )}
                      {onDelete && (
                        <button
                          type="button"
                          aria-label="Delete reply"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(r, 0);
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {replying && (
        <div className="replybox on enter">
          <Composer
            placeholder={`Reply to ${authorName}…`}
            showInternalToggle={isStaff}
            lockedPrivate={thread.visibility === "private" || undefined}
            submitLabel="Reply"
            autoFocus
            team={team}
            clientName={isStaff ? clientName : null}
            slack={slack}
            onSubmit={async (body, visibility, _at, mentions, client, sendToSlack) => {
              await onReply(body, visibility, mentions, client, sendToSlack);
              setReplying(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

export function CommentsPanel({
  creativeId,
  highlightedCommentId = null,
  onHighlight,
  toolMode,
  onToolModeChange,
  canAnnotate,
  videoMoment = null,
  videoSlide = null,
  creativeVersionId = null,
  copyVersionId = null,
  voiceoverVersionId = null,
  slideTextVersionId = null,
  draft = null,
  onClearDraft,
  compose = false,
}: {
  creativeId: string;
  // From the table's Add Feedback: straight into the comment box.
  compose?: boolean;
  // A pin, area or words placed on the post, to be commented on here.
  draft?: CommentDraft | null;
  onClearDraft?: () => void;
  // A video paused at this moment (phase34); new comments attach to it, and
  // to the version being watched.
  videoMoment?: number | null;
  // The carousel slide that video is, so the comment stays on it.
  videoSlide?: number | null;
  creativeVersionId?: string | null;
  // The copy version showing, to tell a comment made on another one.
  copyVersionId?: string | null;
  // The VO and Text on Image versions showing on the placeholder (phase161),
  // the team's only; none while they aren't shown.
  voiceoverVersionId?: string | null;
  slideTextVersionId?: string | null;
  highlightedCommentId?: string | null;
  onHighlight?: (commentId: string | null) => void;
  // Pin/Region live here (above the composer) rather than the page's own
  // toolbar, but the annotation state itself is still owned by the page —
  // AnnotationLayer (over the artwork) and the highlight-on-select
  // behaviour both need the same toolMode/highlightedCommentId the page
  // already threads through.
  toolMode: ToolMode;
  onToolModeChange: (mode: ToolMode) => void;
  canAnnotate: boolean;
}) {
  const { data: creative } = useCreative(creativeId);
  const { data: agency } = useMyAgency();
  const approve = useApproveConcept();
  const clientName = creative?.projects?.clients?.name ?? null;
  const fromName = (c: CommentRow) => (c.from === "agency" ? (agency?.name ?? null) : clientName);
  // The version a comment was made on, after its Public or Private pill,
  // always (direct instruction): "V2", of what it's about: the copy's for
  // words picked out of the copy, otherwise the artwork's, else the copy's.
  // Red when earlier than the newest.
  const { data: creativeVersions } = useCreativeVersions(creativeId);
  const { data: copyVersions } = useCopyVersions(creativeId);
  // The VO's and Text on Image's (phase161): the team's only, as their
  // versions are, so none for a client.
  const { data: prodVersions } = useProductionVersions(creativeId);
  const versionTagOf = (c: CommentRow): VersionTag | null => {
    const art = c.creative_version_id ? creativeVersions?.find((v) => v.id === c.creative_version_id) : undefined;
    const copy = c.copy_version_id ? copyVersions?.find((v) => v.id === c.copy_version_id) : undefined;
    const vo = c.voiceover_version_id ? prodVersions?.voiceover.find((v) => v.id === c.voiceover_version_id) : undefined;
    const toi = c.slide_text_version_id ? prodVersions?.slide_text.find((v) => v.id === c.slide_text_version_id) : undefined;
    const field = isHighlightAnchor(c.anchor) ? c.anchor.field : null;
    const onCopy = !!field && field in COPY_FIELD_LABELS;
    // Named for what it is, short (direct instruction): CR (Creative), CO
    // (Copy), TOI (Text on Image), VO; the tooltip names them in full.
    const ofProd = (name: string, v: ProductionVersion, all: ProductionVersion[]) => ({ name, no: v.versionNo, old: v.id !== all[0]?.id });
    const ofRow = (name: string, v: { id: string; version_no: number }, all: { id: string }[]) => ({ name, no: v.version_no, old: v.id !== all[0]?.id });
    // Of what it's about: the words picked out (copy, VO, Text on Image),
    // otherwise the artwork, else the copy.
    const pick =
      field === "voiceover" && vo && prodVersions
        ? ofProd("VO", vo, prodVersions.voiceover)
        : field === "slide_text" && toi && prodVersions
          ? ofProd("TOI", toi, prodVersions.slide_text)
          : onCopy && copy && copyVersions
            ? ofRow("CO", copy, copyVersions)
            : art && creativeVersions
              ? ofRow("CR", art, creativeVersions)
              : copy && copyVersions
                ? ofRow("CO", copy, copyVersions)
                : null;
    if (!pick) return null;
    // Every version it was made on, in its tooltip (direct instruction:
    // all of them, without taking more room).
    const named = [
      art && `Creative V${art.version_no}`,
      copy && `Copy V${copy.version_no}`,
      toi && `Text on Image V${toi.versionNo}`,
      vo && `VO V${vo.versionNo}`,
    ]
      .filter(Boolean)
      .join(", ")
      .replace(/, ([^,]*)$/, " and $1");
    return { label: `${pick.name} V${pick.no}`, old: pick.old, named };
  };
  // Made on a version other than the one showing, newest included: picking
  // it brings that version up.
  const elsewhere = (c: CommentRow) =>
    (!!c.creative_version_id && !!creativeVersionId && c.creative_version_id !== creativeVersionId) ||
    (!!c.copy_version_id && !!copyVersionId && c.copy_version_id !== copyVersionId) ||
    (!!c.voiceover_version_id && !!voiceoverVersionId && c.voiceover_version_id !== voiceoverVersionId) ||
    (!!c.slide_text_version_id && !!slideTextVersionId && c.slide_text_version_id !== slideTextVersionId);
  const { data: currentUser } = useCurrentUser();
  const { data: membership } = useMyMembership(creative?.agency_id);
  const { data: comments, isLoading, isError } = useComments(creativeId);
  const { data: photos } = useAvatarUrls((comments ?? []).map((c) => c.author?.avatar_asset_id));
  const createComment = useCreateComment(creativeId);
  const toggleResolved = useToggleCommentResolved(creativeId);
  const editComment = useEditComment(creativeId);
  const toggleVisibility = useToggleCommentVisibility(creativeId);
  const deleteComment = useDeleteComment(creativeId);
  // The comment an Owner has asked to delete, and how many replies go too.
  const [deleting, setDeleting] = useState<{ comment: CommentRow; replies: number } | null>(null);

  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    if (!highlightedCommentId) return;
    document
      .getElementById(`cmt-${highlightedCommentId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [highlightedCommentId]);

  const isStaff = membership ? membership.client_id === null : false;
  // The project's Slack channel, for the team's tick (phase162): only while
  // the workspace is connected and the project has a channel.
  const { data: slackConnection } = useSlackConnection(isStaff ? creative?.agency_id : undefined);
  const { data: projectSlack } = useProjectSlack(isStaff && slackConnection ? creative?.project_id : undefined);
  const slack: ComposerSlack | null =
    isStaff && slackConnection && projectSlack
      ? {
          channel: projectSlack.channel_name,
          teamComments: projectSlack.team_comments,
          includePrivate: projectSlack.include_private,
          clientActivity: projectSlack.client_activity,
        }
      : null;
  // Who can be @mentioned (phase138): the project's team, offered to the
  // team only, not including yourself (the database drops that anyway).
  const { data: teamData } = useProjectTeam(creative?.project_id ?? "", isStaff);
  const team = useMemo(
    () => (isStaff ? (teamData ?? []).filter((t) => t.user_id !== currentUser?.id) : []),
    [isStaff, teamData, currentUser?.id],
  );
  // Owners and the Primary Owner delete any comment (phase97).
  const canDelete = isStaff && (membership?.role === "owner" || membership?.role === "primary_owner");

  const { threads, repliesByParent, openCount } = useMemo(() => {
    const all = comments ?? [];
    const topLevel = all.filter((c) => c.parent_id === null);
    const repliesByParent = new Map<string, CommentRow[]>();
    for (const c of all) {
      if (c.parent_id) {
        const list = repliesByParent.get(c.parent_id) ?? [];
        list.push(c);
        repliesByParent.set(c.parent_id, list);
      }
    }
    const openCount = topLevel.filter((t) => !t.resolved_at).length;
    return { threads: topLevel, repliesByParent, openCount };
  }, [comments]);

  const filtered = threads.filter((thread) => {
    const replies = repliesByParent.get(thread.id) ?? [];
    switch (filter) {
      case "unresolved":
        return !thread.resolved_at;
      case "resolved":
        return !!thread.resolved_at;
      case "mine":
        return (
          thread.author_id === currentUser?.id ||
          replies.some((r) => r.author_id === currentUser?.id)
        );
      case "internal":
        return thread.visibility === "private";
      default:
        return true;
    }
  });

  return (
    <aside className="cmts">
      <div className="cmts-h">
        <b>Comments</b>
        <span className="n">{openCount} open</span>
        {/* Which comments show, a dropdown as Creative and Copy's (direct
            instruction: cleaner than a row of pills). Private is the
            team's: a client never sees a private comment. */}
        <span className="vsel cfilter">
          <select id="cFilter" aria-label="Show comments" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            {FILTERS.filter((f) => isStaff || f.key !== "internal").map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </span>
      </div>

      <div className="cmts-b">
        {isError && (
          <div className="empty">
            <b>Couldn&rsquo;t load comments</b>
          </div>
        )}
        {!isError && !isLoading && filtered.length === 0 && (
          <div className="empty">
            <b>No comments</b>
            <span>
              {filter === "all"
                ? "Be the first to leave one."
                : "Nothing matches this filter."}
            </span>
          </div>
        )}
        {filtered.map((thread) => (
          <CommentCard
            key={thread.id}
            thread={thread}
            replies={repliesByParent.get(thread.id) ?? []}
            isStaff={isStaff}
            currentUserId={currentUser?.id}
            isHighlighted={highlightedCommentId === thread.id}
            photos={photos}
            fromName={fromName}
            versionTag={versionTagOf(thread)}
            selectable={!!versionTagOf(thread)?.old || elsewhere(thread)}
            clientName={clientName}
            team={team}
            onSelect={() => onHighlight?.(thread.id)}
            slack={slack}
            onReply={(body, visibility, mentions, client, sendToSlack) =>
              createComment.mutateAsync({
                body,
                parentId: thread.id,
                visibility,
                mentions,
                forClient: !!client,
                clientSource: client?.source ?? null,
                sendToSlack,
              })
            }
            onToggleResolved={(resolve) =>
              toggleResolved.mutate({ commentId: thread.id, resolve })
            }
            onToggleVisibility={(commentId, visibility) =>
              toggleVisibility.mutate({ commentId, visibility })
            }
            onEdit={(commentId, body, mentions) => editComment.mutateAsync({ commentId, body, mentions })}
            onDelete={canDelete ? (comment, replies) => setDeleting({ comment, replies }) : undefined}
          />
        ))}
      </div>

      <div className="cmt-tools">
        <button
          type="button"
          className="tool"
          aria-pressed={toolMode === "pin"}
          disabled={!canAnnotate}
          title="Pin comment"
          onClick={() => onToolModeChange(toolMode === "pin" ? null : "pin")}
        >
          <svg viewBox="0 0 24 24">
            <path d="M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11z" />
            <circle cx="12" cy="10" r="2.4" />
          </svg>
        </button>
        <button
          type="button"
          className="tool"
          aria-pressed={toolMode === "region"}
          disabled={!canAnnotate}
          title="Region comment"
          onClick={() => onToolModeChange(toolMode === "region" ? null : "region")}
        >
          <svg viewBox="0 0 24 24">
            <rect x="3.5" y="3.5" width="17" height="17" rx="2" strokeDasharray="4 3" />
          </svg>
        </button>
      </div>

      {approve.error && <p className="autherr">{errorMessage(approve.error, "Couldn't approve the concept")}</p>}
      <Composer
        placeholder="Add a comment…"
        asked={compose}
        showInternalToggle={isStaff}
        moment={videoMoment}
        team={team}
        draft={draft}
        onClearDraft={onClearDraft}
        clientName={isStaff ? clientName : null}
        slack={slack}
        beside={
          // Approve Concept (phase115, direct instruction): while the post
          // is in Concept with one written, for the client or the team.
          creative && canApproveConcept(creative) ? (
            <button
              type="button"
              className="btn sm approve-concept"
              disabled={approve.isPending}
              onClick={() => approve.mutate(creativeId)}
            >
              {approve.isPending ? "Approving…" : "Approve Concept"}
            </button>
          ) : null
        }
        onSubmit={async (body, visibility, at, mentions, client, sendToSlack) => {
          const forClient = { forClient: !!client, clientSource: client?.source ?? null, sendToSlack };
          if (draft) {
            await createComment.mutateAsync({
              body,
              parentId: null,
              visibility,
              mentions,
              ...forClient,
              voiceoverVersionId,
              slideTextVersionId,
              ...draft,
            });
            onClearDraft?.();
            return;
          }
          await createComment.mutateAsync({
            body,
            parentId: null,
            visibility,
            mentions,
            ...forClient,
            // The artwork and copy versions showing (direct instruction),
            // so a plain comment says what it was made on too.
            creativeVersionId,
            copyVersionId,
            voiceoverVersionId,
            slideTextVersionId,
            ...(at != null
              ? {
                  anchor: {
                    type: "time" as const,
                    t: Math.round(at * 100) / 100,
                    ...(videoSlide !== null ? { slide: videoSlide } : {}),
                  },
                }
              : {}),
          });
        }}
      />

      {deleting && (
        <ConfirmDialog
          title={deleting.comment.parent_id ? "Delete Reply?" : "Delete Comment?"}
          message={`${deleting.comment.parent_id ? "this reply" : "this comment"} from ${deleting.comment.author?.name ?? deleting.comment.guest_name ?? "someone"}${
            deleting.replies > 0 ? ` and its ${deleting.replies === 1 ? "reply" : `${deleting.replies} replies`}` : ""
          } will be gone for everyone, here and on any review link. It can't be undone.`}
          confirmLabel="Delete"
          pendingLabel="Deleting…"
          isPending={deleteComment.isPending}
          error={deleteComment.error}
          errorFallback="Couldn't delete it"
          onConfirm={() =>
            deleteComment.mutate(deleting.comment.id, {
              onSuccess: () => {
                if (highlightedCommentId === deleting.comment.id) onHighlight?.(null);
                setDeleting(null);
              },
            })
          }
          onClose={() => {
            deleteComment.reset();
            setDeleting(null);
          }}
        />
      )}
    </aside>
  );
}
