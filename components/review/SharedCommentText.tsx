"use client";

import { useState } from "react";
import { CommentBody, EditCommentButton } from "@/components/creative-review/CommentBody";
import { useGuestEditKeysStore } from "@/store/guest-edit-keys-store";
import type { SharedCreative } from "@/hooks/use-shared-review";
import type { ReviewController } from "@/hooks/use-review-controller";

// A comment's words on a review link, with Edit when this browser made it
// (phase75: a guest's edit key is kept in the browser that posted it).
export function SharedCommentText({
  comment,
  controller,
}: {
  comment: SharedCreative["comments"][number];
  controller: ReviewController;
}) {
  const mine = useGuestEditKeysStore((s) => !!s.keys[comment.id]);
  const [editing, setEditing] = useState(false);
  return (
    <>
      <CommentBody
        body={comment.body}
        editedAt={comment.edited_at}
        editing={editing}
        onEditingChange={setEditing}
        onSave={(body) => controller.editComment.mutateAsync({ commentId: comment.id, body })}
      />
      {mine && !editing && <EditCommentButton className="cedit-btn" onClick={() => setEditing(true)} />}
    </>
  );
}
