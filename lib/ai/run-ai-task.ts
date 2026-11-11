import type { SupabaseClient } from "@supabase/supabase-js";
import { generateDraft, type AiUsage } from "./generate-draft";
import type { Attachment } from "./attachment";
import { isReadOnly } from "@/lib/plans";

export interface AiTaskResult {
  ok: boolean;
  status: number;
  text?: string;
  error?: string;
}

function monthStartIso(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

// Shared by every route that calls a provider on an agency's behalf
// (app/api/ai/draft, app/api/ai/wiifm-note) — loads the agency's
// configured model and cap, enforces the cap before calling anything,
// calls the model, and logs the usage event only on success (a failed
// provider call shouldn't count against the cap). The caller is
// responsible for its own staff-membership check first — this assumes
// that's already happened.
// Which feature a request is for (phase130), recorded with its usage.
export type AiTask =
  | "copy_chat"
  | "design_direction"
  | "proofread"
  | "check"
  | "check_creative"
  | "check_design"
  | "wiifm_note"
  | "voice_post"
  | "strategy_overview"
  | "classify_comment"
  // Ask Frank (phase147): logged, never counted towards the limit.
  | "ask_frank";

// Requests logged but left out of the monthly limit (decided directly:
// Ask Frank is help, free to the workspace).
const UNCOUNTED_TASKS: AiTask[] = ["ask_frank"];

export async function runAiTask(
  supabase: SupabaseClient,
  agencyId: string,
  userId: string,
  task: AiTask,
  // One string, or parts (copy chat): every part but the last is the same
  // across a conversation's messages, so a provider can keep it.
  prompt: string | string[],
  attachments: Attachment[] = [],
  // The answer as it's written (Design with Frank), where the model can.
  onText?: (text: string) => void,
  // A model of the feature's own rather than the workspace's (Ask Frank's
  // smaller one).
  model?: string,
): Promise<AiTaskResult> {
  const { data: agency, error: agencyError } = await supabase
    .from("agencies")
    .select("ai_default_model, ai_monthly_request_cap, plan, trial_ends_at")
    .eq("id", agencyId)
    .single();
  if (agencyError || !agency) {
    return { ok: false, status: 500, error: "Couldn't load this workspace" };
  }
  // Free's trial over (phase41): read-only, so nothing new is drafted.
  if (isReadOnly(agency.plan, agency.trial_ends_at)) {
    return {
      ok: false,
      status: 403,
      error: "Your workspace's free trial has ended, so Frank is read-only. Choose a plan in Settings → Billing → Plans to carry on.",
    };
  }

  // What counts: every request but the uncounted kind (Ask Frank), which
  // isn't held to the limit either.
  const { count, error: countError } = await supabase
    .from("ai_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", agencyId)
    .gte("created_at", monthStartIso())
    .or(`task.is.null,task.not.in.(${UNCOUNTED_TASKS.join(",")})`);
  if (countError) {
    return { ok: false, status: 500, error: "Couldn't check this workspace's usage" };
  }
  if (!UNCOUNTED_TASKS.includes(task) && (count ?? 0) >= agency.ai_monthly_request_cap) {
    return {
      ok: false,
      status: 429,
      error: `This workspace has reached its monthly AI limit (${agency.ai_monthly_request_cap}). It resets on the 1st.`,
    };
  }

  let text: string;
  let usage: AiUsage | undefined;
  try {
    ({ text, usage } = await generateDraft(model ?? agency.ai_default_model, prompt, attachments, onText));
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: err instanceof Error ? err.message : "The AI provider request failed",
    };
  }

  const { error: logError } = await supabase
    .from("ai_usage_events")
    .insert({
      agency_id: agencyId,
      user_id: userId,
      model: model ?? agency.ai_default_model,
      task,
      input_tokens: usage?.input ?? null,
      cache_read_tokens: usage?.cacheRead ?? null,
      output_tokens: usage?.output ?? null,
    });
  if (logError) {
    // The call already succeeded and the caller is waiting on its result —
    // an un-logged usage event undercounts the cap slightly, far less
    // harmful than throwing away a result the agency already effectively
    // paid for.
    console.error("ai_usage_events insert failed", logError);
  }

  return { ok: true, status: 200, text };
}
