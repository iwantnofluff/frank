"use client";

import type { SharedCreative } from "@/hooks/use-shared-review";
import { BriefFields } from "@/components/creative-review/BriefPanel";
import { postFormats } from "@/lib/formats";

// The post's brief on the review link (direct instruction), as a signed-in
// Client reads it on the post's page.
export function ReviewBrief({ active, delivery }: { active: SharedCreative; delivery: "scheduled" | "continuous" }) {
  return (
    <BriefFields
      name={active.name}
      formats={postFormats(active)}
      delivery={delivery}
      scheduledAt={active.scheduled_at}
      dueOn={active.due_on}
      publishOn={active.publish_on}
      teamNames={active.brief?.team ?? []}
      concept={active.brief?.concept}
      referenceUrls={active.brief?.reference_urls}
      slideText={active.slide_text ?? []}
    />
  );
}
