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
  color: string;
}[] = [
  { scheduledLabel: "Concept", continuousLabel: "Concept", band: "internal", color: "#6B7280" }, // 1
  { scheduledLabel: "Copy", continuousLabel: "Copy", band: "internal", color: "#6B7280" }, // 2
  { scheduledLabel: "Design", continuousLabel: "Design", band: "internal", color: "#6B7280" }, // 3
  { scheduledLabel: "Internal QC", continuousLabel: "Internal QC", band: "internal", color: "#6B7280" }, // 4
  { scheduledLabel: "Client review", continuousLabel: "Client review", band: "review", color: "#007BFF" }, // 5
  { scheduledLabel: "Approved", continuousLabel: "Approved", band: "approved", color: "#2BB65B" }, // 6
  { scheduledLabel: "Scheduled", continuousLabel: "Ready to deliver", band: "scheduled", color: "#2BB65B" }, // 7
  { scheduledLabel: "Published", continuousLabel: "Delivered", band: "published", color: "#14161A" }, // 8
];

const EXCEPTION_TABLE: Record<Exception, { label: string; color: string }> = {
  changes_requested: { label: "Changes Requested", color: "#FF8A00" },
  rejected: { label: "Rejected", color: "#FF0000" },
};

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

// Ported from the prototype's STAGES/EXC colour columns — the calendar
// table's Status pill (`.stg`) reads its background/text colour straight
// from this, same "exception always wins" precedence as bandOf().
export function stageColor(stage: number, exception: Exception | null): string {
  if (exception) return EXCEPTION_TABLE[exception].color;
  return (STAGE_TABLE[stage - 1] ?? STAGE_TABLE[0]).color;
}

export function exceptionLabel(exception: Exception): string {
  return EXCEPTION_TABLE[exception].label;
}
