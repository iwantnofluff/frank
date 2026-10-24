"use client";

import type { PostArtwork } from "@/hooks/use-artwork-by-creative";
import type { ThumbnailAsset } from "@/hooks/use-thumbnails";
import { useArtworkUrl } from "@/hooks/use-asset-signed-url";

// The table's Creative cell (direct instruction): a small phone with the
// post's thumbnail (phase118) or its artwork, a video's first frame, at
// half the row's height and laid over the cell so the row is never taller
// for it; the file name under it; hovering opens the larger preview.
export function ArtworkCell({
  artwork,
  thumbnail,
  after,
}: {
  artwork: PostArtwork;
  thumbnail?: ThumbnailAsset;
  // Beside the phone: a video's Add Thumbnail, while it has none.
  after?: React.ReactNode;
}) {
  const shown = thumbnail ?? artwork.first;
  const video = !thumbnail && artwork.first.mime_type.startsWith("video/");
  const { data: url } = useArtworkUrl(shown.storage_key);
  return (
    <span className="artcell">
      <span className="artcell-top">
        <span className="artmini" aria-hidden="true">
          {url &&
            (video ? (
              <video src={`${url}#t=0.1`} muted playsInline preload="metadata" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL
              <img src={url} alt="" />
            ))}
        </span>
        {after}
      </span>
      <span className="artname">
        <span className="artname-f">{artwork.names[0]}</span>
        {artwork.names.length > 1 && <span className="tdim">+{artwork.names.length - 1}</span>}
      </span>
    </span>
  );
}
