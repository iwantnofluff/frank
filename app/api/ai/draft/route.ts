import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAiTask } from "@/lib/ai/run-ai-task";

// Platform-pays: the app's own provider keys, not anything an agency
// supplies — see docs/parity-gaps.md. Which model is used isn't a
// per-request choice; it's the agency's own configured default
// (Settings > Knowledge), so the caller only sends what to draft, not
// which provider — runAiTask resolves the model and enforces the cap.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { agencyId?: string; prompt?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { agencyId, prompt } = body;
  if (!agencyId || !prompt?.trim()) {
    return NextResponse.json(
      { error: "agencyId and prompt are both required" },
      { status: 400 },
    );
  }

  // Same membership shape use-my-membership.ts already reads client-side
  // (role/client_id, excluding a removed membership) — RLS would block the
  // usage-log insert below anyway, this just returns a real 403 instead of
  // a confusing 500.
  const { data: membership } = await supabase
    .from("memberships")
    .select("client_id")
    .eq("agency_id", agencyId)
    .eq("user_id", user.id)
    .is("removed_at", null)
    .maybeSingle();
  if (!membership || membership.client_id !== null) {
    return NextResponse.json({ error: "Staff access required" }, { status: 403 });
  }

  const result = await runAiTask(supabase, agencyId, user.id, prompt);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ text: result.text });
}
