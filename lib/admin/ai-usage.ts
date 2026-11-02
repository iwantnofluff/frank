import { requestCost } from "@/lib/ai/cost";
import type { AiTask } from "@/lib/ai/run-ai-task";

// The admin area's AI figures (decided directly, 2 Nov 2026), from
// admin_ai_usage_by_month (phase131): requests and estimated cost, by
// workspace, feature and month.

export interface UsageSummaryRow {
  month: string; // "2026-11"
  agency_id: string;
  model: string;
  task: string | null;
  requests: number;
  with_tokens: number;
  input_tokens: number | string;
  cache_read_tokens: number | string;
  output_tokens: number | string;
}

export const TASK_LABELS: Record<AiTask, string> = {
  copy_chat: "Draft with Frank",
  design_direction: "Design with Frank",
  proofread: "Proofreading",
  check: "Check WIIFM and Check Brand",
  check_creative: "Check Creative",
  check_design: "Check Design",
  wiifm_note: "WIIFM notes",
  voice_post: "Speak It",
  strategy_overview: "Strategy overview",
  classify_comment: "Sorting client comments",
};

export interface AiFigures {
  requests: number;
  dollars: number;
  // Requests with no tokens recorded (before 1.64), not in dollars.
  unpriced: number;
}

const empty = (): AiFigures => ({ requests: 0, dollars: 0, unpriced: 0 });

function add(into: AiFigures, r: UsageSummaryRow) {
  into.requests += r.requests;
  into.unpriced += r.requests - r.with_tokens;
  const cost = requestCost({
    model: r.model,
    input_tokens: Number(r.input_tokens),
    cache_read_tokens: Number(r.cache_read_tokens),
    output_tokens: Number(r.output_tokens),
  });
  if (cost === null) into.unpriced += r.with_tokens;
  else into.dollars += cost;
}

export function sumBy(rows: UsageSummaryRow[], key: (r: UsageSummaryRow) => string | null): Map<string, AiFigures> {
  const out = new Map<string, AiFigures>();
  for (const r of rows) {
    const k = key(r);
    if (k === null) continue;
    if (!out.has(k)) out.set(k, empty());
    add(out.get(k)!, r);
  }
  return out;
}

export function sumAll(rows: UsageSummaryRow[]): AiFigures {
  const out = empty();
  for (const r of rows) add(out, r);
  return out;
}

// By feature, most expensive first; requests from before 1.64 under
// "Not recorded".
export function byTask(rows: UsageSummaryRow[]): (AiFigures & { task: string; label: string })[] {
  return [...sumBy(rows, (r) => r.task ?? "unknown")]
    .map(([task, f]) => ({ task, label: TASK_LABELS[task as AiTask] ?? "Not recorded (before 1.64)", ...f }))
    .sort((a, b) => b.dollars - a.dollars || b.requests - a.requests);
}

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// The last n months' keys, oldest first, ending with this one.
export function lastMonths(n: number, now = Date.now()): string[] {
  const d = new Date(now);
  return Array.from({ length: n }, (_, i) => monthKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (n - 1 - i), 1))));
}
