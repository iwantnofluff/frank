"use client";

import { useCreativeVersions } from "@/hooks/use-creative-versions";
import { useAssetSignedUrl } from "@/hooks/use-asset-signed-url";
import type { CreativeListRow } from "@/hooks/use-creatives";

// Real artwork when a creative has one, a plain "No Creative" tile when it
// doesn't (a real post/brief exists — creatives.name, scheduled_at etc. are
// all real — but nothing's been uploaded for it yet) — shared by
// FeedPreviewGrid and ShareModal's picker, the two grids that show several
// creatives at once. Dropped the earlier decorative gradient placeholder
// here per direct instruction: once every non-artwork tile reads a plain
// text label, a colourful stand-in for a photo that isn't there just
// competes with that label rather than clarifying anything.
// (CreativePreviewPopover's own PlaceholderArt is untouched — this
// component never used it for anything but this one fallback case.)
//
// One signed-URL fetch per tile (useAssetSignedUrl, the same hook the
// single-creative Content view already uses for its own artwork);
// TanStack Query caches by storage_key, so re-opening the same grid
// doesn't refetch.
export function FeedTileArt({
  creative,
  timeLabel,
}: {
  creative: CreativeListRow;
  timeLabel: string;
}) {
  const { data: versions } = useCreativeVersions(creative.id);
  const latest = versions?.[0] ?? null;
  const { data: signedUrl } = useAssetSignedUrl(latest?.asset?.storage_key);
  const isVideo = latest?.asset?.mime_type?.startsWith("video/") ?? false;

  if (!signedUrl) {
    return (
      <div className="pp-empty">
        <b>{creative.name}</b>
        <span>No Creative</span>
      </div>
    );
  }

  return (
    <div className="pp-art pp-art-real">
      {isVideo ? (
        <video src={signedUrl} muted />
      ) : (
        // Signed URLs are short-lived and per-request — not a fit for
        // next/image's static optimisation (same reasoning as the
        // Content view's own img, app/(app)/creatives/[id]/page.tsx).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={signedUrl} alt={creative.name} />
      )}
      <div className="pp-art-overlay">
        <div className="pp-art-title">{creative.name}</div>
        <div className="pp-art-time">{timeLabel}</div>
      </div>
    </div>
  );
}

// The padding slots beyond the real creative count, up to a fixed 9 — no
// brief/post planned here at all, so there's nothing to call a missing
// creative. These slots stand in for the client's actual published feed
// (Meta/Instagram), which this app doesn't sync yet — "Live Post" reads as
// where a real live post will show once that's connected, rather than
// implying something is missing the way "No Creative" would for a slot
// that was never meant to hold planned work in the first place.
//
// While the client's live feed is still on its way (phase54), the same
// slot says so, gently pulsing, rather than "Live Post" (which reads as
// nothing connected).
export function EmptyTileArt({ loading = false }: { loading?: boolean }) {
  return (
    <div className={loading ? "pp-empty loading" : "pp-empty"}>
      <span>{loading ? "Frank is working…" : "Live Post"}</span>
    </div>
  );
}
