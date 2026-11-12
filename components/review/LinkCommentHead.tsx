"use client";

import { CommentWhen } from "@/components/creative-review/CommentWhen";
import { avatarColour } from "@/lib/avatar-colour";
import { formatWhen, initialsOf } from "@/lib/comment-display";
import type { SharedCreative } from "@/hooks/use-shared-review";

// A comment's author and time on a review link, as on the post's page in
// Frank (direct instruction: the two should match): initials in the
// person's colour, whose side they're on, or the client "via" whoever
// logged it (phase149), and "just now".
export function LinkCommentHead({
  comment,
  avatarClass,
  clientName,
  agencyName,
}: {
  comment: SharedCreative["comments"][number];
  avatarClass: string;
  clientName: string;
  agencyName: string;
}) {
  const name = comment.author_name;
  return (
    <>
      <span className={avatarClass} style={{ background: avatarColour(name) }}>
        {initialsOf(name)}
      </span>
      <b>
        {name}
        <span className="cmt-from"> {comment.via ?? `(${comment.from_client ? clientName : agencyName})`}</span>
      </b>
      <CommentWhen iso={comment.created_at} date={formatWhen(comment.created_at)} />
    </>
  );
}
