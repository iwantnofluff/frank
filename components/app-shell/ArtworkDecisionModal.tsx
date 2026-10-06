"use client";

import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { useCreativeVersions, versionSlides } from "@/hooks/use-creative-versions";
import { useAssetSignedUrl } from "@/hooks/use-asset-signed-url";
import { useKeepArtwork, useRemoveArtworkNow, type NotificationRow } from "@/hooks/use-notifications";
import { dayMonth } from "@/lib/artwork-removal";
import { errorMessage } from "@/lib/errors";

// An Approved post with no live date, 7 days past its due date (phase60):
// an Owner or Admin removes its artwork now, or keeps it for good. Either
// way its copy and comments stay.
export function ArtworkDecisionModal({
  post,
  onClose,
}: {
  post: NonNullable<NotificationRow["creative"]>;
  onClose: () => void;
}) {
  const { data: versions } = useCreativeVersions(post.id);
  const first = versionSlides(versions?.[0])[0]?.asset;
  const { data: url } = useAssetSignedUrl(first?.mime_type.startsWith("image/") ? first.storage_key : undefined);
  const remove = useRemoveArtworkNow();
  const keep = useKeepArtwork();
  const busy = remove.isPending || keep.isPending;
  const error = remove.error ?? keep.error;
  const since = post.due_on ? `its due date, ${dayMonth(post.due_on)}` : post.approved_at ? `it was approved, ${dayMonth(post.approved_at)}` : null;

  return (
    <Modal
      title="Remove Artwork?"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <span className="grow">
            <Link className="btn ghost" href={`/creatives/${post.id}`} onClick={onClose}>
              Open Post
            </Link>
          </span>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => keep.mutateAsync(post.id).then(onClose, () => {})}
          >
            {keep.isPending ? "Keeping…" : "Keep Artwork"}
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={busy}
            onClick={() => remove.mutateAsync(post.id).then(onClose, () => {})}
          >
            {remove.isPending ? "Removing…" : "Remove Artwork"}
          </button>
        </>
      }
    >
      <div className="artdec">
        <div className="artdec-media">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL
            <img src={url} alt="" />
          ) : (
            <span className="artdec-none" title={first?.filename ?? "No artwork"}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M3 15l5-5 4 4 3-3 6 6" />
                <circle cx="9" cy="9" r="1.4" />
              </svg>
            </span>
          )}
        </div>
        <div>
          <b>{post.name}</b>
          <span>
            {[post.project?.client?.name, post.project?.name].filter(Boolean).join(" · ")}
          </span>
        </div>
      </div>
      <p className="msection-d">
        This post is Approved and has no live date{since ? `; it's been more than 7 days since ${since}` : ""}. Removing
        its artwork deletes every version&apos;s files for good. Its copy and comments are kept. Keeping it means
        you won&apos;t be asked about this post again.
      </p>
      {error && <p className="autherr">{errorMessage(error, "Couldn't do that")}</p>}
    </Modal>
  );
}
