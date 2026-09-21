// Mirrors shared_link_allowed_creative_ids() (supabase/seed.sql) exactly,
// client-side, so ShareModal can tell staff what a link will actually show
// before they create it — that function's stage >= 5 rule is unconditional
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
  /** How many of those are actually stage >= 5, so a client would see them. */
  eligibleCount: number;
  /** candidateCount - eligibleCount — always because a creative is still
   * below Client Review (Concept/Copy/Design/Internal QC), the only
   * reason shared_link_allowed_creative_ids ever excludes one. */
  excludedCount: number;
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
      // stage === 5 is already a subset of stage >= 5 — this scope can
      // never itself cause an exclusion, only ever come back empty.
      candidates = creatives.filter((c) => c.stage === 5);
      break;
    case "one":
      candidates = creatives.filter((c) => c.id === options.currentCreativeId);
      break;
    case "pick":
      candidates = creatives.filter((c) => (options.pickedIds ?? []).includes(c.id));
      break;
  }

  const eligibleCount = candidates.filter((c) => c.stage >= 5).length;
  return {
    candidateCount: candidates.length,
    eligibleCount,
    excludedCount: candidates.length - eligibleCount,
  };
}
