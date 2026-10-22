"use client";

import { useApproveConcept } from "@/hooks/use-approve-concept";
import { errorMessage } from "@/lib/errors";

// Approve Concept in a table's Concept & Reference cell (phase115, direct
// instruction): the Add buttons' small pill, in Frank's green, for the
// client or the team. Moves the post to In Production and records the
// approval as a comment in the presser's name.
export function ApproveConceptButton({ creativeId }: { creativeId: string }) {
  const approve = useApproveConcept();
  return (
    <>
      <button
        type="button"
        className="tpending-btn approve"
        disabled={approve.isPending}
        title="Approve this concept: it moves to In Production"
        onClick={(e) => {
          // Not the row's own click, which opens the post's page.
          e.stopPropagation();
          approve.mutate(creativeId);
        }}
      >
        {approve.isPending ? "Approving…" : "Approve Concept"}
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </button>
      {approve.error && <span className="autherr tiny">{errorMessage(approve.error, "Couldn't approve it")}</span>}
    </>
  );
}
