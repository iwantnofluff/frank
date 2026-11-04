"use client";

import type { PostArtwork } from "@/hooks/use-artwork-by-creative";
import type { ThumbnailAsset } from "@/hooks/use-thumbnails";
import { useArtworkThumbUrl } from "@/hooks/use-asset-signed-url";
import { useState } from "react";
import { postSize, type FormatSizes } from "@/lib/formats";
import { postTemplate, tabletOrientation } from "@/lib/post-templates";

// An iPad's screen: 1180 × 820, on its side or upright.
const TABLET_RATIO = 1180 / 820;

// The table's Creative cell (direct instruction): a small phone with the
// post's thumbnail (phase118) or its artwork, a video's first frame, at
// half the row's height and laid over the cell so the row is never taller
// for it; the file name under it; hovering opens the larger preview. Other
// Content's formats in a small iPad instead, held as the Review page holds
// it (reported directly: the cell still showed the phone): an email
// upright and from its top, a board's artwork whole.
export function ArtworkCell({
  artwork,
  thumbnail,
  after,
  format,
  sizes,
}: {
  artwork: PostArtwork;
  thumbnail?: ThumbnailAsset;
  // At the bottom left: a video's Add Thumbnail, while it has none.
  after?: React.ReactNode;
  // The post's main format and chosen sizes, for the device's shape.
  format?: string | null;
  sizes?: FormatSizes | null;
}) {
  // The artwork's own shape, once its image has loaded (which way a board
  // with no set size turns).
  const [natural, setNatural] = useState<number | null>(null);
  const t = postTemplate(format);
  const tablet = t.device === "tablet";
  const portrait = tablet && tabletOrientation(format, postSize(format, sizes), natural) === "portrait";
  const ratio = !tablet ? 9 / 16 : portrait ? 1 / TABLET_RATIO : TABLET_RATIO;
  const fill = t.platform === "board" ? " whole" : t.platform === "email" ? " top" : "";
  const shown = thumbnail ?? artwork.first;
  const video = !thumbnail && artwork.first.mime_type.startsWith("video/");
  // The small copy (lib/artwork-preview.ts): the cell is a few dozen pixels.
  const { data: url } = useArtworkThumbUrl(shown.storage_key);
  return (
    <span className="artcell">
      <span className={`artmini${tablet ? ` tablet${fill}` : ""}`} aria-hidden="true" style={{ aspectRatio: String(ratio) }}>
        {url &&
          (video ? (
            <video src={`${url}#t=0.1`} muted playsInline preload="metadata" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL
            <img
              src={url}
              alt=""
              loading="lazy"
              decoding="async"
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth && img.naturalHeight) setNatural(img.naturalWidth / img.naturalHeight);
              }}
            />
          ))}
      </span>
      <span className="artname">
        <span className="artname-f">{artwork.names[0]}</span>
        {artwork.names.length > 1 && <span className="tdim">+{artwork.names.length - 1}</span>}
      </span>
      {/* At the cell's bottom left, as the other columns' buttons are. */}
      {after && <span className="artcell-after">{after}</span>}
    </span>
  );
}
