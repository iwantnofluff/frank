"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { linkHref } from "@/lib/links";
import { LinkPreviewCard } from "@/components/project/LinkPreviewCard";

// A post's references as links that open in a new tab (phase58). In a
// table row the click stops here, so the row doesn't open the post too.
// Text that isn't an address shows as plain text. With `preview` (the
// tables), hovering a link shows its page's preview card (direct
// instruction), held open while the pointer moves onto it.
export function ReferenceLinks({
  urls,
  className = "cc-ref",
  preview = false,
}: {
  urls: string[];
  className?: string;
  preview?: boolean;
}) {
  const [hover, setHover] = useState<{ href: string; rect: DOMRect } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show(href: string, target: HTMLElement) {
    if (timer.current) clearTimeout(timer.current);
    const rect = target.getBoundingClientRect();
    timer.current = setTimeout(() => setHover({ href, rect }), 300);
  }
  function hide() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHover(null), 200);
  }
  function keep() {
    if (timer.current) clearTimeout(timer.current);
  }

  return (
    <>
      {urls.map((url, i) => {
        const href = linkHref(url);
        return href ? (
          <a
            key={i}
            className={className}
            href={href}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={preview ? (e) => show(href, e.currentTarget) : undefined}
            onMouseLeave={preview ? hide : undefined}
          >
            {url}
          </a>
        ) : (
          <span key={i} className={className}>
            {url}
          </span>
        );
      })}
      {hover &&
        createPortal(
          <LinkPreviewCard href={hover.href} anchor={hover.rect} onMouseEnter={keep} onMouseLeave={hide} />,
          document.body,
        )}
    </>
  );
}
