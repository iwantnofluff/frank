"use client";

import { useMyAgency } from "./use-my-agency";
import { useMyMembership } from "./use-my-membership";

// Whether the signed-in user is agency staff (client_id null) rather than
// a client-role reviewer — for gating staff-only UI (Settings, the
// Visibility nav item). Keyed on real membership, same pattern as
// CommentsPanel's isStaff, not store/ui-store.ts's previewMode (a
// cosmetic-only agency/client preview toggle with no bearing on actual
// access).
//
// isPending, not isLoading: useMyMembership stays disabled (and therefore
// not "loading") until useMyAgency resolves an agencyId, so isLoading
// alone would report "done" before either query has actually run —
// defaulting isStaff to false during that window is the fail-closed
// direction, but a caller that renders on isLoading===false would still
// flash the client-safe UI state momentarily even for real staff.
export function useIsStaff() {
  const { data: agency, isPending: agencyPending } = useMyAgency();
  const { data: membership, isPending: membershipPending } = useMyMembership(
    agency?.agencyId,
  );

  return {
    isStaff: membership ? membership.client_id === null : false,
    isPending: agencyPending || membershipPending,
  };
}
