import type { SupabaseClient } from "@supabase/supabase-js";
import { generateDraft } from "./generate-draft";
import type { Attachment } from "./attachment";

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
export async function runAiTask(
  supabase: SupabaseClient,
  agencyId: string,
  userId: string,
  prompt: string,
  attachments: Attachment[] = [],
): Promise<AiTaskResult> {
  const { data: agency, error: agencyError } = await supabase
    .from("agencies")
    .select("ai_default_model, ai_monthly_request_cap")
    .eq("id", agencyId)
    .single();
  if (agencyError || !agency) {
    return { ok: false, status: 500, error: "Couldn't load this agency" };
  }

  const { count, error: countError } = await supabase
    .from("ai_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", agencyId)
    .gte("created_at", monthStartIso());
  if (countError) {
    return { ok: false, status: 500, error: "Couldn't check this agency's usage" };
  }
  if ((count ?? 0) >= agency.ai_monthly_request_cap) {
    return {
      ok: false,
      status: 429,
      error: `This agency has reached its monthly AI limit (${agency.ai_monthly_request_cap}). It resets on the 1st.`,
    };
  }

  let text: string;
  try {
    text = await generateDraft(agency.ai_default_model, prompt, attachments);
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: err instanceof Error ? err.message : "The AI provider request failed",
    };
  }

  const { error: logError } = await supabase
    .from("ai_usage_events")
    .insert({ agency_id: agencyId, user_id: userId, model: agency.ai_default_model });
  if (logError) {
    // The call already succeeded and the caller is waiting on its result —
    // an un-logged usage event undercounts the cap slightly, far less
    // harmful than throwing away a result the agency already effectively
    // paid for.
    console.error("ai_usage_events insert failed", logError);
  }

  return { ok: true, status: 200, text };
}
