// phase13_simplify_stage_pipeline.sql: four stages, replacing the
// original eight. Copy/Design/Internal QC (old 2-4) and Scheduled/
// Published (old 7-8) were never reachable by any code path in the app —
// confirmed by a repo-wide search before this change — so they're folded
// into Internal Review and Approved respectively, not just relabelled.
//
// One table drives both the label (stageLabel) and the band (bandOf) a
// stage belongs to, so the two cannot drift apart the way they would as
// two separately-maintained lookups — exactly the shape of bug the
// prototype's own STAGES table (frank-prototype.html) avoids by being the
// single source both stageOf() and bandOf() read from.
export type Exception = "changes_requested" | "rejected";
export type Band = "internal" | "review" | "approved" | Exception;

const STAGE_TABLE: { label: string; band: Band; color: string }[] = [
  { label: "Concept", band: "internal", color: "#6B7280" }, // 1
  { label: "Internal Review", band: "internal", color: "#6B7280" }, // 2
  { label: "Client review", band: "review", color: "#007BFF" }, // 3
  { label: "Approved", band: "approved", color: "#2BB65B" }, // 4
];

const EXCEPTION_TABLE: Record<Exception, { label: string; color: string }> = {
  changes_requested: { label: "Changes Requested", color: "#FF8A00" },
  rejected: { label: "Rejected", color: "#FF0000" },
};

// `delivery` no longer changes anything — every remaining stage reads the
// same either way (the scheduled/continuous split only ever mattered for
// the old stage 7/8 rows, both gone now). Kept as a parameter so no call
// site needs touching.
export function stageLabel(stage: number, _delivery: "scheduled" | "continuous") {
  const row = STAGE_TABLE[stage - 1];
  return row ? row.label : `Stage ${stage}`;
}

// Matches the prototype's bandOf(e) = e.exc || STAGES[e.stage][2] exactly:
// an exception always wins over the stage, unconditionally — this function
// doesn't enforce the DB's `exception is null or stage between 1 and 3`
// constraint (that's the database's job, not a pure function's), it just
// computes the band for whatever (stage, exception) it's given, the same
// way the prototype's own bandOf() never checks that boundary either.
// A stage outside 1-4 falls back to STAGE_TABLE[0] ("internal") — the same
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
