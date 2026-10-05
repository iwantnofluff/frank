"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

export interface SharedCreative {
  id: string;
  name: string;
  format: string;
  formats: string[]; // every format, main first
  // A carousel's slides, signed, in order — empty for a single image.
  slides: { position: number; signed_url: string | null; mime_type: string; filename: string }[];
  slide_count: number | null; // carousels only
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
    };

// Goes through /api/shared-review rather than calling the RPC directly —
// that route is what signs the asset URLs with the service role key. A
// public visitor has no session to sign anything with themselves, and
// nothing should grant anon a broad storage read that would let anyone
// enumerate any agency's files by guessing paths.
export function useSharedReview(token: string, passcode: string | null) {
  return useQuery({
    queryKey: ["shared-review", token, passcode],
    queryFn: async (): Promise<SharedReviewResult> => {
      const res = await fetch("/api/shared-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, passcode }),
      });
      if (!res.ok && res.status !== 500) {
        throw new Error("Couldn't load this review link.");
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });
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
