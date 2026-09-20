// Schema doc, "The stage pipeline": stages 1-6 are identical across both
// delivery modes; 7 and 8 are relabelled for continuous projects since
// there's nothing to "schedule" or "publish" in the platform sense there.
//
// One table drives both the label (stageLabel) and the band (bandOf) a
// stage belongs to, so the two cannot drift apart the way they would as
// two separately-maintained lookups — exactly the shape of bug the
// prototype's own STAGES table (frank-prototype.html) avoids by being the
// single source both stageOf() and bandOf() read from.
export type Exception = "changes_requested" | "rejected";
export type Band =
  | "internal"
  | "review"
  | "approved"
  | "scheduled"
  | "published"
  | Exception;

const STAGE_TABLE: {
  scheduledLabel: string;
  continuousLabel: string;
  band: Band;
}[] = [
  { scheduledLabel: "Concept", continuousLabel: "Concept", band: "internal" }, // 1
  { scheduledLabel: "Copy", continuousLabel: "Copy", band: "internal" }, // 2
  { scheduledLabel: "Design", continuousLabel: "Design", band: "internal" }, // 3
  { scheduledLabel: "Internal QC", continuousLabel: "Internal QC", band: "internal" }, // 4
  { scheduledLabel: "Client review", continuousLabel: "Client review", band: "review" }, // 5
  { scheduledLabel: "Approved", continuousLabel: "Approved", band: "approved" }, // 6
  { scheduledLabel: "Scheduled", continuousLabel: "Ready to deliver", band: "scheduled" }, // 7
  { scheduledLabel: "Published", continuousLabel: "Delivered", band: "published" }, // 8
];

export function stageLabel(
  stage: number,
  delivery: "scheduled" | "continuous",
) {
  const row = STAGE_TABLE[stage - 1];
  if (!row) return `Stage ${stage}`;
  return delivery === "scheduled" ? row.scheduledLabel : row.continuousLabel;
}

// Matches the prototype's bandOf(e) = e.exc || STAGES[e.stage][2] exactly:
// an exception always wins over the stage, unconditionally — this function
// doesn't enforce the DB's `exception is null or stage between 1 and 5`
// constraint (that's the database's job, not a pure function's), it just
// computes the band for whatever (stage, exception) it's given, the same
// way the prototype's own bandOf() never checks that boundary either.
// A stage outside 1-8 falls back to STAGE_TABLE[0] ("internal") — the same
// fallback shape as the prototype's `STAGES[e.stage]||STAGES[1]`.
export function bandOf(stage: number, exception: Exception | null): Band {
  if (exception) return exception;
  return (STAGE_TABLE[stage - 1] ?? STAGE_TABLE[0]).band;
}
