// Mirrors shared_link_allowed_creative_ids() (phase13, then phase69: every
// link also shows every post in Client Review) exactly,
// client-side, so ShareModal can tell staff what a link will actually show
// before they create it — that function's stage >= 3 rule is unconditional
// on every scope, and nothing in the app surfaced that until now (see
// docs/parity-gaps.md, "Upload/Edit modal" / stage-transition gap: a
// creative made through New Brief sits at stage 1 forever, so any link
// covering it silently shows nothing).
export type ShareScope = "pending" | "all" | "one" | "pick";

export interface EligibilityCreative {
  id: string;
  stage: number;
}

export interface ShareEligibility {
  /** How many creatives this scope selects, before the stage rule. */
  candidateCount: number;
  /** How many of those are actually stage >= 3, so a client would see them. */
  eligibleCount: number;
  /** candidateCount - eligibleCount — always because a creative is still
   * below Client Review (Concept or Internal Review), the only reason
   * shared_link_allowed_creative_ids ever excludes one. */
  excludedCount: number;
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
      // stage === 3 is already a subset of stage >= 3 — this scope can
      // never itself cause an exclusion, only ever come back empty.
      candidates = creatives.filter((c) => c.stage === 3);
      break;
    case "one":
      candidates = creatives.filter((c) => c.id === options.currentCreativeId);
      break;
    case "pick":
      candidates = creatives.filter((c) => (options.pickedIds ?? []).includes(c.id));
      break;
  }

  const eligibleCount = candidates.filter((c) => c.stage >= 3).length;
  const chosen = new Set(candidates.map((c) => c.id));
  return {
    candidateCount: candidates.length,
    eligibleCount,
    excludedCount: candidates.length - eligibleCount,
    alsoInClientReview: creatives.filter((c) => c.stage === 3 && !chosen.has(c.id)).length,
  };
}
