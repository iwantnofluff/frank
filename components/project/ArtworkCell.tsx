"use client";

import type { PostArtwork } from "@/hooks/use-artwork-by-creative";
import type { ThumbnailAsset } from "@/hooks/use-thumbnails";
import { useArtworkUrl } from "@/hooks/use-asset-signed-url";

// The table's Creative cell (direct instruction): a small phone with the
// post's thumbnail (phase118) or its first image, the file name under it,
// no taller than the row already is; hovering opens the larger preview.
// A video without a thumbnail shows a play mark rather than loading the
// video for every row.
export function ArtworkCell({ artwork, thumbnail }: { artwork: PostArtwork; thumbnail?: ThumbnailAsset }) {
  const image = thumbnail ?? (artwork.first.mime_type.startsWith("image/") ? artwork.first : null);
  const { data: url } = useArtworkUrl(image?.storage_key);
  return (
    <span className="artcell">
      <span className="artmini" aria-hidden="true">
        {image && url ? (
          // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL
          <img src={url} alt="" />
        ) : !image ? (
          <svg viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        ) : null}
      </span>
      <span className="artname">
        <span className="artname-f">{artwork.names[0]}</span>
        {artwork.names.length > 1 && <span className="tdim">+{artwork.names.length - 1}</span>}
      </span>
    </span>
  );
}
