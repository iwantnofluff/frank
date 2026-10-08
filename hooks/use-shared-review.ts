"use client";

import { useEffect, useRef } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";

export interface SharedCreative {
  id: string;
  name: string;
  format: string;
  formats: string[]; // every format, main first
  // A carousel's slides, signed, in order — empty for a single image.
  slides: { position: number; signed_url: string | null; mime_type: string; filename: string }[];
  slide_count: number | null; // carousels only
  // When its artwork was removed after going live (phase60).
  artwork_removed_at: string | null;
  stage: number;
  // Real status, same field the internal app's own bandOf() reads — a
  // Read-only from this page for now — the guest UI's own "Make Changes"
  // action that used to set this to 'changes_requested' was pulled (kept
  // here since the field itself, and bandOf()'s "exception always wins"
  // read of it, are still very much live throughout the internal app).
  exception: "changes_requested" | "rejected" | null;
  position: number;
  scheduled_at: string | null;
  destination: string | null;
  approved_at: string | null;
  asset: {
    version_no: number;
    mime_type: string;
    filename: string;
    signed_url: string | null;
  } | null;
  copy: {
    version_no: number;
    fields: Record<string, string>;
  } | null;
  comments: {
    id: string;
    author_name: string;
    body: string;
    created_at: string;
    // A moment in the video, when made at one (phase34).
    anchor?: { type: string; t?: number } | null;
  }[];
}

export interface SharedReviewContact {
  id: string;
  name: string;
  email: string;
}

export type SharedReviewResult =
  | { status: "not_found" }
  | { status: "passcode_required"; invalid?: boolean }
  | {
      status: "ok";
      scope: "pending" | "all" | "one" | "pick";
      can_approve: boolean;
      project: { id: string; name: string; delivery: "scheduled" | "continuous" };
      creatives: SharedCreative[];
      // The client's own configured Client Team — a guest picks their
      // identity from this instead of typing it (GuestComposer.tsx), with a
      // free-text fallback for anyone not yet on the list.
      contacts: SharedReviewContact[];
      // The agency's saved theme and logo (null when it has none).
      branding: { theme: Record<string, unknown> | null; logo_url: string | null };
      // The client's logo, for the avatar beside the handle.
      client_logo_url: string | null;
      // The client's name: the page's heading and the phone's handle.
      client_name: string | null;
      // The project's posts in grid order (phase67): an id only for posts
      // this link shares; every other post is its stage alone. Null if it
      // couldn't be read.
      feed: SharedFeedEntry[] | null;
    };

export interface SharedFeedEntry {
  id: string | null;
  // Only for a post this link doesn't share that's still in Internal
  // Review (phase68); null otherwise.
  name?: string | null;
  stage: number;
  reel: boolean;
}

// Goes through /api/shared-review rather than calling the RPC directly —
// that route is what signs the asset URLs with the service role key. A
// public visitor has no session to sign anything with themselves, and
// nothing should grant anon a broad storage read that would let anyone
// enumerate any agency's files by guessing paths.
export function useSharedReview(token: string, passcode: string | null) {
  const queryClient = useQueryClient();
  const key = ["shared-review", token, passcode];
  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<SharedReviewResult> => {
      const res = await fetch("/api/shared-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, passcode }),
      });
      if (!res.ok && res.status !== 500) {
        throw new Error("Couldn't load this review link.");
      }
      const next = (await res.json()) as SharedReviewResult;
      // Reloaded because something changed: the pictures already showing
      // keep their addresses (a new one is a new download, and a flash).
      return keepSignedUrls(queryClient.getQueryData<SharedReviewResult>(key), next);
    },
    enabled: !!token,
    retry: false,
  });
  useReviewPulse(token, passcode, query.data?.status === "ok", () => {
    void queryClient.invalidateQueries({ queryKey: key });
  });
  return query;
}

// Signed addresses last an hour; one is reused for up to 45 minutes.
const REUSE_FOR_MS = 45 * 60 * 1000;
const firstSeen = new Map<string, number>();

function keepSignedUrls(prev: SharedReviewResult | undefined, next: SharedReviewResult): SharedReviewResult {
  if (!prev || prev.status !== "ok" || next.status !== "ok") return next;
  const now = Date.now();
  const reuse = (old: string | null | undefined, fresh: string | null) => {
    if (!old || !fresh) return fresh;
    const seen = firstSeen.get(old) ?? now;
    firstSeen.set(old, seen);
    return now - seen < REUSE_FOR_MS ? old : fresh;
  };
  const before = new Map(prev.creatives.map((c) => [c.id, c]));
  return {
    ...next,
    client_logo_url: reuse(prev.client_logo_url, next.client_logo_url),
    creatives: next.creatives.map((c) => {
      const was = before.get(c.id);
      if (!was) return c;
      const sameAsset =
        was.asset && c.asset && was.asset.version_no === c.asset.version_no && was.asset.filename === c.asset.filename;
      return {
        ...c,
        asset: c.asset && sameAsset ? { ...c.asset, signed_url: reuse(was.asset!.signed_url, c.asset.signed_url) } : c.asset,
        slides: c.slides.map((s) => {
          const old = was.slides.find((o) => o.position === s.position && o.filename === s.filename);
          return old ? { ...s, signed_url: reuse(old.signed_url, s.signed_url) } : s;
        }),
      };
    }),
  };
}

// Every 8 seconds while the page is in view (not in a background tab),
// asks the server for a fingerprint of the comments, stages and versions;
// when it changes, the page reloads (direct instruction: a comment made on
// another device appears without a refresh). A visitor here has no
// session, so the database can't send them changes directly as it does
// for signed-in pages (hooks/use-live-updates.ts).
function useReviewPulse(token: string, passcode: string | null, enabled: boolean, onChange: () => void) {
  const { data } = useQuery({
    queryKey: ["shared-review-pulse", token, passcode],
    queryFn: async (): Promise<string | null> => {
      const res = await fetch("/api/shared-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, passcode, pulse: true }),
      });
      if (!res.ok) return null;
      const body = await res.json();
      return typeof body.pulse === "string" ? body.pulse : null;
    },
    enabled: enabled && !!token,
    refetchInterval: 8000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!data) return;
    if (last.current && last.current !== data) onChange();
    last.current = data;
  }, [data, onChange]);
}

// The review link's client's live Instagram feed (phase54), if connected.
// The review link's client's live Instagram feed (phase54), if connected,
// a page at a time as the grid scrolls.
export function useSharedInstagramFeed(token: string, passcode: string | null, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ["shared-instagram", token, passcode],
    queryFn: async ({ pageParam }): Promise<import("@/lib/instagram/store").FeedResult> => {
      const res = await fetch("/api/shared-review/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, passcode, after: pageParam }),
      });
      return res.json();
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.status === "ok" ? last.feed.next : null),
    enabled,
    staleTime: 5 * 60_000,
  });
}

// A live carousel's slides on a review link, fetched when it's opened.
export function useSharedInstagramSlides(token: string, passcode: string | null, mediaId: string | null) {
  return useQuery({
    queryKey: ["shared-instagram-slides", token, passcode, mediaId],
    queryFn: async (): Promise<import("@/lib/instagram/store").LiveSlide[]> => {
      const res = await fetch("/api/shared-review/instagram/slides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, passcode, media: mediaId }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.status !== "ok") throw new Error("Couldn't load this carousel");
      return data.slides;
    },
    enabled: !!mediaId,
    staleTime: 5 * 60_000,
  });
}
