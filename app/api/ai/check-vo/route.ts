import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAiTask } from "@/lib/ai/run-ai-task";
import { buildVoCheckPrompt, voCheckResult } from "@/lib/ai/build-vo-check-prompt";

// Longest VO or Text on Image this check sends, so one request (and what
// it costs against the cap) stays predictable.
const MAX_CHARS = 20000;

// "Check VO and Text on Image" (direct instruction): whether a video post's
// VO and its Text on Image communicate the same thing. The team's only;
// one call through runAiTask (task check_vo, phase159), so the agency's
// monthly cap and usage log apply. Checks the words the Edit window holds,
// saved or not, and stores nothing.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { creativeId?: string; vo?: unknown; texts?: unknown; noun?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!body.creativeId) return NextResponse.json({ error: "creativeId is required" }, { status: 400 });
  const vo = typeof body.vo === "string" ? body.vo : "";
  const texts = Array.isArray(body.texts) ? body.texts.map((t) => (typeof t === "string" ? t : "")) : [];
  const noun = typeof body.noun === "string" && body.noun.trim() ? body.noun.trim() : "Slide";
  if (!vo.trim()) return NextResponse.json({ error: "Write the VO first, on the Production tab, then check it." }, { status: 400 });
  if (!texts.some((t) => t.trim())) {
    return NextResponse.json({ error: "Write the Text on Image first, on the Production tab, then check it." }, { status: 400 });
  }
  if (vo.length + texts.join("").length > MAX_CHARS) {
    return NextResponse.json({ error: "The VO and Text on Image are too long to check together." }, { status: 400 });
  }

  // Read as the caller: RLS decides whether they can see it at all.
  const { data: post } = await supabase.from("creatives").select("id, agency_id, name").eq("id", body.creativeId).maybeSingle();
  if (!post) return NextResponse.json({ error: "This post isn't available" }, { status: 404 });

  const { data: membership } = await supabase
    .from("memberships")
    .select("client_id")
    .eq("agency_id", post.agency_id)
    .eq("user_id", user.id)
    .is("removed_at", null)
    .maybeSingle();
  if (!membership || membership.client_id !== null) {
    return NextResponse.json({ error: "Staff access required" }, { status: 403 });
  }

  const prompt = buildVoCheckPrompt({ postName: post.name ?? "Untitled", vo, texts, noun });
  const result = await runAiTask(supabase, post.agency_id, user.id, "check_vo", prompt);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(voCheckResult(result.text ?? ""));
}
