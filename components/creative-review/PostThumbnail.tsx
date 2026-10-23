"use client";

import { useThumbnailVersions } from "@/hooks/use-thumbnails";
import { useArtworkUrl } from "@/hooks/use-asset-signed-url";

// A video post's thumbnail on its page (phase118, decided directly: the
// team and the client see it), a small card beside the phone, with the
// words on it.
export function PostThumbnail({ creativeId, aspectRatio, text }: { creativeId: string; aspectRatio: string; text?: string | null }) {
  const { data: versions } = useThumbnailVersions(creativeId);
  const latest = versions?.find((v) => v.asset) ?? null;
  const { data: url } = useArtworkUrl(latest?.asset?.storage_key);
  if (!latest?.asset) return null;
  return (
    <figure className="pthumb">
      <figcaption>
        Thumbnail <span className="tdim">V{latest.versionNo}</span>
      </figcaption>
      <span className="pthumb-img" style={{ aspectRatio }}>
        {url && (
          // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL
          <img src={url} alt={latest.asset.filename} />
        )}
      </span>
      {text?.trim() && <span className="pthumb-t">{text}</span>}
    </figure>
  );
}
