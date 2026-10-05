"use client";

import { linkHref } from "@/lib/links";

// A post's references as links that open in a new tab (phase58). In a
// table row the click stops here, so the row doesn't open the post too.
// Text that isn't an address shows as plain text.
export function ReferenceLinks({ urls, className = "cc-ref" }: { urls: string[]; className?: string }) {
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
          >
            {url}
          </a>
        ) : (
          <span key={i} className={className}>
            {url}
          </span>
        );
      })}
    </>
  );
}
