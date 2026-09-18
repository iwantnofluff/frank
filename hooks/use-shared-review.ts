"use client";

import { useQuery } from "@tanstack/react-query";

export interface SharedCreative {
  id: string;
  name: string;
  format: string;
  stage: number;
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
  }[];
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
