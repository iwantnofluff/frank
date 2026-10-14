"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useIsStaff } from "@/hooks/use-is-staff";

// Placeholder — no performance-reporting feature exists yet. This page
// exists so the rail's Analytics link renders the app shell instead of a
// bare 404; it is not the feature.
//
// The team's only, as Visibility is (direct instruction: a client could
// reach it by its address). A client is sent to their dashboard.
export default function AnalyticsPage() {
  const router = useRouter();
  const { isStaff, isPending } = useIsStaff();

  useEffect(() => {
    if (!isPending && !isStaff) router.replace("/dashboard");
  }, [isPending, isStaff, router]);

  if (isPending || !isStaff) return null;

  return (
    <div className="pad">
      <h1 className="h1">Analytics</h1>
      <div className="empty">
        <b>Analytics isn&rsquo;t built yet</b>
        <span>This screen is coming in a later phase.</span>
      </div>
    </div>
  );
}
