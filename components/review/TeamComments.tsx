"use client";

import { useQuery } from "@tanstack/react-query";
import { creativeQuery } from "@/hooks/use-creative";
import { useReviewViewer } from "@/hooks/use-review-viewer";
import { CommentsPanel } from "@/components/creative-review/CommentsPanel";

// The workspace's team, signed in, on a review link (phase150, direct
// instruction: the team comments from the link without opening Frank). The
// post's own comments, as on its page in Frank: Private ones too, the
// Private switch, On behalf of the client and @mentions, in place of the
// link's list and its name picker. No Approve: that's the client's. Only
// when they can see the post themselves; otherwise the link's own view.
export function useTeamOnPost(creativeId: string | undefined): boolean {
  const { data: viewer } = useReviewViewer();
  const { data } = useQuery({ ...creativeQuery(creativeId ?? ""), enabled: !!creativeId && !!viewer?.isTeam });
  return !!viewer?.isTeam && !!creativeId && data?.id === creativeId;
}

export function TeamComments({ creativeId }: { creativeId: string }) {
  return (
    <div className="rv-team">
      <CommentsPanel creativeId={creativeId} toolMode={null} onToolModeChange={() => {}} canAnnotate={false} />
    </div>
  );
}
