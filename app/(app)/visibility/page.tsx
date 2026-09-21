"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useIsStaff } from "@/hooks/use-is-staff";

// Placeholder — no client-visibility feature exists yet. This page exists
// so the rail's Visibility link renders the app shell instead of a bare
// 404; it is not the feature.
//
// Staff-only, same reasoning and pattern as settings/layout.tsx's guard:
// NavRail already hides this link from a client-role session, but that's
// reachability, not enforcement — this is the screen where staff would
// configure what a client can see, so a client reaching it by direct URL
// (even to an empty placeholder) is the same permission boundary as
// Settings, not a separate decision.
export default function VisibilityPage() {
  const router = useRouter();
  const { isStaff, isPending } = useIsStaff();

  useEffect(() => {
    if (!isPending && !isStaff) router.replace("/dashboard");
  }, [isPending, isStaff, router]);

  if (isPending || !isStaff) return null;

  return (
    <div className="pad">
      <h1 className="h1">Visibility</h1>
      <div className="empty">
        <b>Visibility isn&rsquo;t built yet</b>
        <span>This screen is coming in a later phase.</span>
      </div>
    </div>
  );
}
