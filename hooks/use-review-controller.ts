"use client";

import { useState } from "react";
import {
  useSharedInstagramFeed,
  useSharedReview,
  type SharedCreative,
  type SharedReviewContact,
} from "./use-shared-review";
import {
  useSubmitSharedComment,
  useSubmitSharedApproval,
  useSubmitSharedRequestChanges,
} from "./use-shared-actions";
import { useGuestIdentityStore } from "@/store/guest-identity-store";

// One data assembly, one set of handlers — the mobile and desktop layouts
// are both driven from this, so there's no separate mobile-only or
// desktop-only path that can drift out of sync with the other.
export function useReviewController(token: string) {
  const [passcode, setPasscode] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [commentDraft, setCommentDraft] = useState("");
  // A video (phase34): the paused moment, whether the next comment is
  // attached to it, the comment picked, and a request to jump to a moment.
  const [videoMoment, setVideoMoment] = useState<number | null>(null);
  // The carousel slide that video is, if it's one of several.
  const [videoSlide, setVideoSlide] = useState<number | null>(null);
  const [attachMoment, setAttachMoment] = useState(true);
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
  const [videoSeek, setVideoSeek] = useState<{ t: number; nonce: number; slide?: number } | null>(null);

  const { data, isLoading, isError } = useSharedReview(token, passcode);
  // The client's real Instagram, if connected (phase54): a Feed view beside
  // the post, showing the shared posts among the real ones.
  const instagram = useSharedInstagramFeed(token, passcode, data?.status === "ok");
  const firstPage = instagram.data?.pages[0];
  // Every page loaded so far, as one feed (scrolling loads the next).
  const liveFeed =
    firstPage?.status === "ok"
      ? {
          ...firstPage.feed,
          posts: instagram.data!.pages.flatMap((p) => (p.status === "ok" ? p.feed.posts : [])),
        }
      : null;
  const liveMore = {
    hasMore: !!instagram.hasNextPage,
    loading: instagram.isFetchingNextPage,
    onMore: () => void instagram.fetchNextPage(),
  };
  const [view, setView] = useState<"post" | "feed">("post");
  const identity = useGuestIdentityStore();
  const submitComment = useSubmitSharedComment(token, passcode);
  const submitApproval = useSubmitSharedApproval(token, passcode);
  const submitRequestChanges = useSubmitSharedRequestChanges(token, passcode);

  const creatives: SharedCreative[] = data?.status === "ok" ? data.creatives : [];
  const active = creatives[activeIndex] ?? null;
  const canApprove = data?.status === "ok" && data.can_approve;
  const contacts: SharedReviewContact[] = data?.status === "ok" ? data.contacts : [];

  function goTo(index: number) {
    setActiveIndex(Math.max(0, Math.min(creatives.length - 1, index)));
    setCommentDraft("");
    setVideoMoment(null);
    setHighlightedCommentId(null);
    setVideoSeek(null);
  }

  async function postComment(name: string, email: string) {
    if (!active || !commentDraft.trim()) return;
    identity.setIdentity(name, email);
    const result = await submitComment.mutateAsync({
      creativeId: active.id,
      body: commentDraft.trim(),
      guestName: name,
      guestEmail: email,
      atSeconds: videoMoment !== null && attachMoment ? videoMoment : null,
      slide: videoMoment !== null && attachMoment ? videoSlide : null,
    });
    if (result.status === "ok") setCommentDraft("");
    return result;
  }

  // A comment picked in the list goes to its moment in the video.
  function selectComment(id: string, t: number | null, slide?: number) {
    setHighlightedCommentId(id);
    if (t !== null) setVideoSeek({ t, nonce: Date.now(), slide });
  }

  async function approve(name: string, email: string) {
    if (!active) return;
    identity.setIdentity(name, email);
    return submitApproval.mutateAsync({
      creativeId: active.id,
      guestName: name,
      guestEmail: email,
    });
  }

  async function requestChanges(name: string, email: string) {
    if (!active) return;
    identity.setIdentity(name, email);
    const result = await submitRequestChanges.mutateAsync({
      creativeId: active.id,
      body: commentDraft.trim(),
      guestName: name,
      guestEmail: email,
    });
    if (result.status === "ok") setCommentDraft("");
    return result;
  }

  return {
    liveFeed,
    liveMore,
    view,
    setView,
    data,
    isLoading,
    isError,
    passcode,
    setPasscode,
    creatives,
    active,
    activeIndex,
    goTo,
    canApprove,
    contacts,
    commentDraft,
    setCommentDraft,
    postComment,
    approve,
    requestChanges,
    posting: submitComment.isPending,
    approving: submitApproval.isPending,
    requestingChanges: submitRequestChanges.isPending,
    identity,
    videoMoment,
    setVideoMoment,
    setVideoSlide,
    attachMoment,
    setAttachMoment,
    highlightedCommentId,
    setHighlightedCommentId,
    videoSeek,
    selectComment,
  };
}

export type ReviewController = ReturnType<typeof useReviewController>;
