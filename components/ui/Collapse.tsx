"use client";

import type { ReactNode } from "react";
import { usePresence } from "@/hooks/use-presence";

// A section's contents that open and close with the Help panel's motion
// (direct instruction): growing to their height while fading and sliding
// in, and shrinking away again on close. Kept on screen while it closes,
// so the close plays too.
export function Collapse({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  const pop = usePresence(open);
  if (!pop.shown) return null;
  return (
    <div className={`collapse${pop.isOpen ? " is-open" : ""}`}>
      <div className={className ? `collapse-in ${className}` : "collapse-in"}>{children}</div>
    </div>
  );
}
