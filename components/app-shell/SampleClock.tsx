"use client";

import { useIsStaff } from "@/hooks/use-is-staff";
import { useStartSampleClock } from "@/hooks/use-sample";

// Starts the sample client's 7 days on the workspace's first visit
// (phase145), as Frank opens for its team. Draws nothing.
export function SampleClock() {
  const { isStaff, isPending } = useIsStaff();
  useStartSampleClock(isStaff && !isPending);
  return null;
}
