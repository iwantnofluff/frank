// Schema doc, "The stage pipeline": stages 1-6 are identical across both
// delivery modes; 7 and 8 are relabelled for continuous projects since
// there's nothing to "schedule" or "publish" in the platform sense there.
const SCHEDULED_LABELS = [
  "Concept",
  "Copy",
  "Design",
  "Internal QC",
  "Client review",
  "Approved",
  "Scheduled",
  "Published",
];

const CONTINUOUS_LABELS = [
  "Concept",
  "Copy",
  "Design",
  "Internal QC",
  "Client review",
  "Approved",
  "Ready to deliver",
  "Delivered",
];

export function stageLabel(
  stage: number,
  delivery: "scheduled" | "continuous",
) {
  const labels = delivery === "scheduled" ? SCHEDULED_LABELS : CONTINUOUS_LABELS;
  return labels[stage - 1] ?? `Stage ${stage}`;
}
