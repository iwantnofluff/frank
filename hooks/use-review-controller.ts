"use client";

import { useState } from "react";
import { useSharedReview, type SharedCreative } from "./use-shared-review";
import {
  useSubmitSharedComment,
  useSubmitSharedApproval,
} from "./use-shared-actions";
import { useGuestIdentityStore } from "@/store/guest-identity-store";

// One data assembly, one set of handlers — the mobile and desktop layouts
// are both driven from this, so there's no separate mobile-only or
// desktop-only path that can drift out of sync with the other.
export function useReviewController(token: string) {
  const [passcode, setPasscode] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [commentDraft, setCommentDraft] = useState("");

  const { data, isLoading, isError } = useSharedReview(token, passcode);
  const identity = useGuestIdentityStore();
  const submitComment = useSubmitSharedComment(token, passcode);
  const submitApproval = useSubmitSharedApproval(token, passcode);

  const creatives: SharedCreative[] = data?.status === "ok" ? data.creatives : [];
  const active = creatives[activeIndex] ?? null;
  const canApprove = data?.status === "ok" && data.can_approve;

  function goTo(index: number) {
    setActiveIndex(Math.max(0, Math.min(creatives.length - 1, index)));
    setCommentDraft("");
  }

  async function postComment(name: string, email: string) {
    if (!active || !commentDraft.trim()) return;
    identity.setIdentity(name, email);
    const result = await submitComment.mutateAsync({
      creativeId: active.id,
      body: commentDraft.trim(),
      guestName: name,
      guestEmail: email,
    });
    if (result.status === "ok") setCommentDraft("");
    return result;
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

  return {
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
    commentDraft,
    setCommentDraft,
    postComment,
    approve,
    posting: submitComment.isPending,
    approving: submitApproval.isPending,
    identity,
  };
}

export type ReviewController = ReturnType<typeof useReviewController>;
