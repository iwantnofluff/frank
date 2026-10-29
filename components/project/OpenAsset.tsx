"use client";

// A post's final asset (phase126, direct instruction): Frank's green pill,
// with the arrow, opening its link (a Google Drive folder, say) in a new
// tab. The team's only.
export function OpenAsset({ url, className = "" }: { url: string; className?: string }) {
  return (
    <a
      className={`tpending-btn approve asset-open ${className}`.trim()}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      onClick={(e) => e.stopPropagation()}
    >
      Open Asset
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 17L17 7M9 7h8v8" />
      </svg>
    </a>
  );
}
