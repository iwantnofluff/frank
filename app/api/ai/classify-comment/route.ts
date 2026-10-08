import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { runAiTask } from "@/lib/ai/run-ai-task";
import { buildClassifyCommentPrompt, parseClassification } from "@/lib/ai/build-classify-comment-prompt";
import type { Anchor } from "@/lib/annotations";

const MAX_AGE_MS = 15 * 60 * 1000;

interface CommentRow {
  id: string;
  agency_id: string;
  body: string;
  anchor: Anchor | null;
  issue_category: string | null;
  created_at: string;
  creatives: { format: string; created_by: string } | null;
}

// Comment intelligence, Phase 1 (docs/frank-data-intelligence.pdf, "1.
// Comment intelligence") — classifies one comment into a small fixed
// taxonomy after the fact, fire-and-forget from every comment-creation
// path (hooks/use-create-comment.ts, hooks/use-shared-actions.ts). Never
// awaited by the caller and never blocks the Post button.
//
// Uses the service role client, not a session-bound one — a guest-authored
// comment (the anonymous shared-review page) has no session at all to
// check. Like the one other place this app uses that client
// (lib/supabase/service-role.ts, app/api/shared-review/route.ts), this
// route doesn't trust anything about the caller — it only ever acts on a
// commentId that already resolves to a real, recent, unclassified row, so
// the worst a bad-faith caller can do is ask for a real comment to be
// (re-)classified, not read or write anything else.
export async function POST(request: Request) {
  let body: { commentId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { commentId } = body;
  if (!commentId) {
    return NextResponse.json({ error: "commentId is required" }, { status: 400 });
  }

  let supabase: ReturnType<typeof createServiceRoleClient>;
  try {
    supabase = createServiceRoleClient();
  } catch {
    return NextResponse.json({ skipped: true, reason: "not_configured" });
  }

  const { data, error } = await supabase
    .from("comments")
    .select("id, agency_id, body, anchor, issue_category, created_at, creatives(format, created_by)")
    .eq("id", commentId)
    .maybeSingle();
  const comment = data as unknown as CommentRow | null;

  if (error || !comment) {
    return NextResponse.json({ skipped: true, reason: "not_found" });
  }
  if (comment.issue_category !== null) {
    return NextResponse.json({ skipped: true, reason: "already_classified" });
  }
  if (Date.now() - new Date(comment.created_at).getTime() > MAX_AGE_MS) {
    return NextResponse.json({ skipped: true, reason: "too_old" });
  }
  if (!comment.creatives) {
    return NextResponse.json({ skipped: true, reason: "no_creative" });
  }

  const prompt = buildClassifyCommentPrompt({
    body: comment.body,
    anchor: comment.anchor,
    format: comment.creatives.format,
  });

  // Attributed to the creative's own creator — there's no real user behind
  // a guest-authored comment, and ai_usage_events.user_id is not null. A
  // deliberate simplification: this agency's own AI usage, billed to
  // whoever owns the creative the comment landed on.
  const result = await runAiTask(supabase, comment.agency_id, comment.creatives.created_by, prompt);
  if (!result.ok) {
    return NextResponse.json({ skipped: true, reason: "ai_task_failed", error: result.error });
  }

  const parsed = parseClassification(result.text ?? "");
  if (!parsed) {
    return NextResponse.json({ skipped: true, reason: "unparseable" });
  }

  const { error: updateError } = await supabase
    .from("comments")
    .update({ issue_category: parsed.category, issue_category_note: parsed.note, sentiment: parsed.sentiment })
    .eq("id", commentId);
  if (updateError) {
    return NextResponse.json({ error: "Couldn't save the classification" }, { status: 500 });
  }

  return NextResponse.json({ status: "ok", category: parsed.category });
}
