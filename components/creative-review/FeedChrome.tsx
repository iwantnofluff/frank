"use client";

import type { LiveFeed } from "@/lib/instagram/store";

export type FeedTab = "posts" | "reels";

// The profile header above a feed grid. With the client's Instagram
// connected (phase54), it reads like the real profile: picture, counts,
// name, description and link. Without, the client's name, as before.
export function FeedProfile({ profile, fallbackName }: { profile: LiveFeed["profile"] | null; fallbackName: string }) {
  if (!profile) {
    return (
      <div className="fp-h">
        <span className="fp-av">
          <i />
        </span>
        <span className="fp-t">
          <b>{fallbackName}</b>
        </span>
      </div>
    );
  }
  const count = (n: number | null, label: string) =>
    n == null ? null : (
      <span className="fp-stat">
        <b>{n.toLocaleString()}</b>
        {label}
      </span>
    );
  return (
    <div className="fp-h fp-live">
      <b className="fp-user">{profile.username}</b>
      <div className="fp-top">
        <span className="fp-av big">
          {profile.pictureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Instagram's own short-lived image URL
            <img src={profile.pictureUrl} alt="" />
          ) : (
            <i />
          )}
        </span>
        <div className="fp-stats">
          {count(profile.posts, "posts")}
          {count(profile.followers, "followers")}
          {count(profile.following, "following")}
        </div>
      </div>
      {(profile.name || profile.bio || profile.website) && (
        <div className="fp-about">
          {profile.name && <b>{profile.name}</b>}
          {profile.bio && <p className="fp-bio">{profile.bio}</p>}
          {profile.website && (
            <a href={profile.website} target="_blank" rel="noreferrer">
              {profile.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// Posts and Reels switch the grid. Saved and Tagged can't be shown:
// Instagram never shares an account's saved posts, and tagged posts need a
// further permission Frank doesn't ask for. Dimmed, saying why.
export function FeedTabs({ tab, onTab }: { tab: FeedTab; onTab: (tab: FeedTab) => void }) {
  return (
    <div className="fp-tabs" role="tablist" aria-label="Profile sections">
      <button type="button" className="fp-tab" role="tab" aria-selected={tab === "posts"} title="Posts" onClick={() => onTab("posts")}>
        <svg viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="1.5" />
          <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
        </svg>
      </button>
      <button type="button" className="fp-tab" role="tab" aria-selected={tab === "reels"} title="Reels" onClick={() => onTab("reels")}>
        <svg viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="4" />
          <path d="M3 8h18M8.5 3l3 5M15 3l3 5" />
          <path d="M11 12.5l4 2.2-4 2.2z" fill="currentColor" stroke="none" />
        </svg>
      </button>
      <div className="fp-tab off" aria-disabled="true" title="Saved posts are private to the account; Instagram doesn't share them">
        <svg viewBox="0 0 24 24">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <div className="fp-tab off" aria-disabled="true" title="Tagged posts need a further Instagram permission, not yet asked for">
        <svg viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="12" cy="10" r="3" />
          <path d="M6.5 19a5.8 5.8 0 0 1 11 0" />
        </svg>
      </div>
    </div>
  );
}
