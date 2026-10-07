"use client";

import { useRef, useState } from "react";
import { useViewportFit } from "@/hooks/use-viewport-fit";
import { useLinkPreview } from "@/hooks/use-link-preview";

// The hover card on a reference link (direct instruction): the linked
// page's preview image, title, description and site, like a link pasted
// into Slack, or the full address when the page offers none (Instagram and
// Facebook often refuse). Opens the page when clicked.
export function LinkPreviewCard({
  href,
  anchor,
  onMouseEnter,
  onMouseLeave,
}: {
  href: string;
  anchor: DOMRect;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  useViewportFit(ref, anchor, { side: "below", gap: 6 });
  const { data: preview, isPending } = useLinkPreview(href);
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <a
      ref={ref}
      className="linkcard"
      href={href}
      target="_blank"
      rel="noreferrer"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={(e) => e.stopPropagation()}
    >
      {isPending ? (
        <span className="linkcard-wait">Frank is working…</span>
      ) : preview ? (
        <>
          {preview.image && !imageFailed && (
            // eslint-disable-next-line @next/next/no-img-element -- the linked site's own preview image
            <img src={preview.image} alt="" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />
          )}
          <span className="linkcard-b">
            {preview.siteName && <span className="linkcard-site">{preview.siteName}</span>}
            {preview.title && <b>{preview.title}</b>}
            {preview.description && <span className="linkcard-d">{preview.description}</span>}
            <span className="linkcard-url">{href}</span>
          </span>
        </>
      ) : (
        <span className="linkcard-b">
          <span className="linkcard-site">No preview from this site</span>
          <span className="linkcard-url full">{href}</span>
        </span>
      )}
    </a>
  );
}
