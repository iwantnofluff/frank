import { STAGE } from "./stage-labels.ts";
// Mirrors shared_link_allowed_creative_ids() (phase69: every link also
// shows every post in Client Review; phase150: the posts chosen show at any
// status) client-side, so ShareModal can tell staff what a link will show
// before they create it, and which of it the client can only read: they
// comment, approve or ask for changes only in Client Review.
export type ShareScope = "pending" | "all" | "one" | "pick";

export interface EligibilityCreative {
  id: string;
  stage: number;
}

export interface ShareEligibility {
  /** How many creatives this scope selects. Every one shows on the link,
   * at any status (phase150). */
  candidateCount: number;
  /** How many of those aren't in Client Review: the client can read them
   * but not comment, approve or ask for changes until they are. */
  readOnlyCount: number;
  /** Posts in Client Review the scope didn't choose, which every link
   * shows anyway (phase69). */
  alsoInClientReview: number;
}

export function resolveShareEligibility(
  creatives: EligibilityCreative[],
  scope: ShareScope,
  options: { currentCreativeId?: string; pickedIds?: string[] } = {},
): ShareEligibility {
  let candidates: EligibilityCreative[];
  switch (scope) {
    case "all":
      candidates = creatives;
      break;
    case "pending":
      candidates = creatives.filter((c) => c.stage === STAGE.review);
      break;
    case "one":
      candidates = creatives.filter((c) => c.id === options.currentCreativeId);
      break;
    case "pick":
      candidates = creatives.filter((c) => (options.pickedIds ?? []).includes(c.id));
      break;
  }

  const chosen = new Set(candidates.map((c) => c.id));
  return {
    candidateCount: candidates.length,
    readOnlyCount: candidates.filter((c) => c.stage !== STAGE.review).length,
    alsoInClientReview: creatives.filter((c) => c.stage === STAGE.review && !chosen.has(c.id)).length,
  };
}
