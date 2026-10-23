import type { SharedCreative } from "@/hooks/use-shared-review";

// A video's thumbnail on a review link (phase118, decided directly: the
// client sees it), after the caption, with the words on it.
export function ReviewThumbnail({ creative }: { creative: SharedCreative }) {
  const t = creative.thumbnail;
  if (!t?.signed_url) return null;
  return (
    <figure className="rthumb">
      <figcaption>
        Thumbnail <span className="tdim">V{t.version_no}</span>
      </figcaption>
      {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL */}
      <img src={t.signed_url} alt={t.filename} />
      {creative.thumbnail_text?.trim() && <span className="rthumb-t">{creative.thumbnail_text}</span>}
    </figure>
  );
}
