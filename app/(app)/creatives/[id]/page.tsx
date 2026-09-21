"use client";

import { use, useMemo, useState } from "react";
import { useCreative } from "@/hooks/use-creative";
import { useCreativeVersions } from "@/hooks/use-creative-versions";
import { useCopyVersions } from "@/hooks/use-copy-versions";
import { useAssetSignedUrl } from "@/hooks/use-asset-signed-url";
import { useComments } from "@/hooks/use-comments";
import { useCreateComment } from "@/hooks/use-create-comment";
import { useMyMembership } from "@/hooks/use-my-membership";
import { useAdvanceCreativeStage } from "@/hooks/use-advance-creative-stage";
import { stageLabel } from "@/lib/stage-labels";
import {
  isHighlightAnchor,
  isPinAnchor,
  isRegionAnchor,
  type HighlightAnchor,
  type PinAnchor,
  type RegionAnchor,
} from "@/lib/annotations";
import { BriefPanel } from "@/components/creative-review/BriefPanel";
import { CommentsPanel } from "@/components/creative-review/CommentsPanel";
import { ChecksAndDraft } from "@/components/creative-review/ChecksAndDraft";
import { ShareModal } from "@/components/creative-review/ShareModal";
import { AnnotationLayer, type ToolMode } from "@/components/creative-review/AnnotationLayer";
import { CaptionHighlighter } from "@/components/creative-review/CaptionHighlighter";
import { UploadOrEditModal } from "@/components/creative-review/UploadOrEditModal";

export default function CreativeReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const {
    data: creative,
    isLoading: creativeLoading,
    isError: creativeError,
  } = useCreative(id);
  const { data: creativeVersions } = useCreativeVersions(id);
  const { data: copyVersions } = useCopyVersions(id);
  const { data: membership, isLoading: membershipLoading } = useMyMembership(
    creative?.agency_id,
  );
  const isStaff = membership ? membership.client_id === null : false;
  const advanceStage = useAdvanceCreativeStage(id);

  // Independent selections: picking a copy version never touches which
  // artwork version is showing, and vice versa (frank-schema.docx —
  // "Versions are independent").
  const [creativeVersionId, setCreativeVersionId] = useState<string | null>(
    null,
  );
  const [copyVersionId, setCopyVersionId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [toolMode, setToolMode] = useState<ToolMode>(null);
  const [highlightedCommentId, setHighlightedCommentId] = useState<
    string | null
  >(null);

  // Shared with CommentsPanel via the same query cache (identical key), so
  // clicking a marker here and clicking a comment there both read and write
  // the same "which thread is highlighted" state.
  const { data: allComments } = useComments(id);
  const createComment = useCreateComment(id);

  const activeCreativeVersion =
    creativeVersions?.find((v) => v.id === creativeVersionId) ??
    creativeVersions?.[0] ??
    null;
  const activeCopyVersion =
    copyVersions?.find((v) => v.id === copyVersionId) ??
    copyVersions?.[0] ??
    null;

  const { data: signedUrl } = useAssetSignedUrl(
    activeCreativeVersion?.asset?.storage_key,
  );

  const { pins, regions, nextAnnotationNumber, captionHighlights } = useMemo(() => {
    const forVersion = (allComments ?? []).filter(
      (c) =>
        activeCreativeVersion && c.creative_version_id === activeCreativeVersion.id,
    );
    const pins = forVersion
      .filter((c) => isPinAnchor(c.anchor))
      .map((c) => ({ ...(c.anchor as PinAnchor), commentId: c.id }));
    const regions = forVersion
      .filter((c) => isRegionAnchor(c.anchor))
      .map((c) => ({ ...(c.anchor as RegionAnchor), commentId: c.id }));
    const nextAnnotationNumber = pins.length + regions.length + 1;

    const captionHighlights = (allComments ?? [])
      .filter(
        (c) =>
          activeCopyVersion &&
          c.copy_version_id === activeCopyVersion.id &&
          isHighlightAnchor(c.anchor) &&
          c.anchor.field === "caption",
      )
      .map((c) => ({ ...(c.anchor as HighlightAnchor), commentId: c.id }));

    return { pins, regions, nextAnnotationNumber, captionHighlights };
  }, [allComments, activeCreativeVersion, activeCopyVersion]);

  if (creativeLoading) {
    return (
      <div className="pad">
        <p className="sub">Loading…</p>
      </div>
    );
  }

  if (creativeError || !creative) {
    return (
      <div className="pad">
        <div className="empty">
          <b>Couldn&rsquo;t load this creative</b>
          <span>It may have been archived, or you may not have access.</span>
        </div>
      </div>
    );
  }

  const delivery = creative.projects?.delivery ?? "scheduled";
  const clientName = creative.projects?.clients?.name ?? "This client";
  const caption = activeCopyVersion?.fields?.caption;
  const isVideo = activeCreativeVersion?.asset?.mime_type.startsWith("video/");

  return (
    <div className="review">
      <div className="stage">
        <div className="stage-h">
          <b className="ph">{creative.name}</b>
          <div className="tools">
            <div className="vsel">
              <label htmlFor="vCreative">Creative</label>
              <select
                id="vCreative"
                value={activeCreativeVersion?.id ?? ""}
                onChange={(e) => setCreativeVersionId(e.target.value)}
                disabled={!creativeVersions?.length}
              >
                {creativeVersions?.length ? (
                  creativeVersions.map((v) => (
                    <option key={v.id} value={v.id}>
                      V{v.version_no}
                    </option>
                  ))
                ) : (
                  <option value="">—</option>
                )}
              </select>
            </div>
            <div className="vsel">
              <label htmlFor="vCopy">Copy</label>
              <select
                id="vCopy"
                value={activeCopyVersion?.id ?? ""}
                onChange={(e) => setCopyVersionId(e.target.value)}
                disabled={!copyVersions?.length}
              >
                {copyVersions?.length ? (
                  copyVersions.map((v) => (
                    <option key={v.id} value={v.id}>
                      V{v.version_no}
                    </option>
                  ))
                ) : (
                  <option value="">—</option>
                )}
              </select>
            </div>
            <button
              type="button"
              className="tool"
              aria-pressed={toolMode === "pin"}
              disabled={!activeCreativeVersion || isVideo}
              title="Pin comment"
              onClick={() =>
                setToolMode((m) => (m === "pin" ? null : "pin"))
              }
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
              disabled={!activeCreativeVersion || isVideo}
              title="Region comment"
              onClick={() =>
                setToolMode((m) => (m === "region" ? null : "region"))
              }
            >
              <svg viewBox="0 0 24 24">
                <rect
                  x="3.5"
                  y="3.5"
                  width="17"
                  height="17"
                  rx="2"
                  strokeDasharray="4 3"
                />
              </svg>
            </button>
            <button
              type="button"
              className="tool"
              title="Share for review"
              onClick={() => setShareOpen(true)}
            >
              <svg viewBox="0 0 24 24">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
              </svg>
            </button>
            {isStaff && creative.stage < 5 && (
              <button
                type="button"
                className="btn"
                disabled={advanceStage.isPending}
                onClick={() => advanceStage.mutate("to_review")}
              >
                {advanceStage.isPending ? "Moving…" : "Move to Client Review"}
              </button>
            )}
            {isStaff && creative.stage === 5 && (
              <button
                type="button"
                className="btn"
                disabled={advanceStage.isPending}
                onClick={() => advanceStage.mutate("to_internal")}
              >
                {advanceStage.isPending ? "Moving…" : "Move back to Internal"}
              </button>
            )}
            {isStaff && activeCreativeVersion && (
              <button
                type="button"
                className="btn primary"
                onClick={() => setUploadModalOpen(true)}
              >
                Upload or Edit
              </button>
            )}
          </div>
        </div>
        {advanceStage.error && (
          <p className="autherr" style={{ padding: "0 20px" }}>
            {advanceStage.error instanceof Error
              ? advanceStage.error.message
              : "Couldn't move this creative"}
          </p>
        )}

        <div className="canvas">
          <div>
            <BriefPanel
              creative={creative}
              latestCopyVersion={copyVersions?.[0] ?? null}
            />
            <ChecksAndDraft />
            {!activeCreativeVersion ? (
              <div className="awaiting">
                <svg viewBox="0 0 24 24">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M3 15l5-5 4 4 3-3 6 6" />
                  <circle cx="9" cy="9" r="1.4" />
                </svg>
                <b>No artwork yet</b>
                <span>
                  {membershipLoading
                    ? " "
                    : isStaff
                      ? "The brief is written. Add the artwork once it has been made."
                      : "The agency hasn't uploaded anything for this piece yet."}
                </span>
                {isStaff && (
                  <button
                    type="button"
                    className="btn primary sm"
                    style={{ marginTop: 10 }}
                    onClick={() => setUploadModalOpen(true)}
                  >
                    Upload Artwork
                  </button>
                )}
              </div>
            ) : (
                <div className="postbox">
              <div className="cmeta">
                <div className="ct">
                  {creative.name} — V{activeCreativeVersion.version_no}
                </div>
                <div className="cs">
                  <span>{creative.format}</span>
                  <span className="sep">·</span>
                  <span>{stageLabel(creative.stage, delivery)}</span>
                </div>
              </div>
              <div className="ig">
                <div className="ig-h">
                  <div className="ig-av">
                    <i />
                  </div>
                  <div>
                    <b>{clientName}</b>
                  </div>
                  <div className="dots">•••</div>
                </div>
                <div className="ig-media">
                  {!signedUrl ? (
                    <div className="ig-noasset">
                      {activeCreativeVersion.asset?.filename ??
                        "No preview available"}
                    </div>
                  ) : isVideo ? (
                    <video src={signedUrl} controls />
                  ) : (
                    <>
                      {/* Signed URLs are short-lived and per-request — not a
                          fit for next/image's static optimisation. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={signedUrl} alt={creative.name} />
                      <AnnotationLayer
                        mode={toolMode}
                        pins={pins}
                        regions={regions}
                        nextNumber={nextAnnotationNumber}
                        highlightedCommentId={highlightedCommentId}
                        onSelect={setHighlightedCommentId}
                        onCreate={(anchor, body) => {
                          createComment.mutate({
                            body,
                            parentId: null,
                            visibility: "private",
                            creativeVersionId: activeCreativeVersion.id,
                            anchor,
                          });
                          setToolMode(null);
                        }}
                      />
                    </>
                  )}
                </div>
                <div className="ig-acts">
                  <svg viewBox="0 0 24 24">
                    <path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21.5l8.8-8.8a5 5 0 0 0 0-7.1z" />
                  </svg>
                  <svg viewBox="0 0 24 24">
                    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.8-.9L3 20.5l1.5-4.4A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z" />
                  </svg>
                  <svg viewBox="0 0 24 24">
                    <path d="M22 2L11 13" />
                    <path d="M22 2l-7 20-4-9-9-4z" />
                  </svg>
                  <svg className="save" viewBox="0 0 24 24">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div className="ig-cap">
                  <b>{clientName}</b>
                  {caption ? (
                    <CaptionHighlighter
                      text={caption}
                      field="caption"
                      highlights={captionHighlights}
                      highlightedCommentId={highlightedCommentId}
                      onSelect={setHighlightedCommentId}
                      onCreate={(anchor, body) => {
                        createComment.mutate({
                          body,
                          parentId: null,
                          visibility: "private",
                          copyVersionId: activeCopyVersion?.id ?? null,
                          anchor,
                        });
                      }}
                    />
                  ) : (
                    <span>
                      {copyVersions?.length
                        ? "No caption on this copy version."
                        : "No copy uploaded yet."}
                    </span>
                  )}
                </div>
                <div className="ig-time">
                  Uploaded{" "}
                  {new Date(activeCreativeVersion.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>

      <CommentsPanel
        creativeId={id}
        highlightedCommentId={highlightedCommentId}
        onHighlight={setHighlightedCommentId}
      />

      {shareOpen && creative.projects && (
        <ShareModal
          projectId={creative.project_id}
          projectName={creative.projects.name}
          currentCreativeId={creative.id}
          onClose={() => setShareOpen(false)}
        />
      )}

      {uploadModalOpen && (
        <UploadOrEditModal
          creativeId={id}
          agencyId={creative.agency_id}
          projectName={creative.projects?.name ?? "This project"}
          latestCreativeVersionNo={creativeVersions?.[0]?.version_no ?? 0}
          latestCopyVersion={copyVersions?.[0] ?? null}
          defaultMode={activeCreativeVersion ? "copy" : "both"}
          onClose={() => setUploadModalOpen(false)}
          onCreativeVersionCreated={setCreativeVersionId}
          onCopyVersionCreated={setCopyVersionId}
        />
      )}
    </div>
  );
}
