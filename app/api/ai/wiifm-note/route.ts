import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAiTask } from "@/lib/ai/run-ai-task";
import { formatById, COPY_FIELD_LABELS } from "@/lib/formats";

// Ported the reasoning behind removing the manual "Approach notes — WIIFM
// rationale" input from BriefPanel.tsx: a hand-typed note goes stale the
// moment the copy it describes changes. This route re-derives it from
// whatever copy version was *just* saved (fetched here, server-side —
// never trusts a client-supplied copy of the text, so it can't drift from
// what's actually in the database) and overwrites creatives.approach_notes
// every time. Called right after a successful copy save
// (UploadOrEditModal), not on a timer or separately — "as and when copy
// versions get done".
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { agencyId?: string; creativeId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { agencyId, creativeId } = body;
  if (!agencyId || !creativeId) {
    return NextResponse.json(
      { error: "agencyId and creativeId are both required" },
      { status: 400 },
    );
  }

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

  const { data: creative, error: creativeError } = await supabase
    .from("creatives")
    .select("concept, format")
    .eq("id", creativeId)
    .single();
  if (creativeError || !creative) {
    return NextResponse.json({ error: "Couldn't load this creative" }, { status: 500 });
  }

  const { data: latestCopy, error: copyError } = await supabase
    .from("copy_versions")
    .select("fields")
    .eq("creative_id", creativeId)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (copyError) {
    return NextResponse.json({ error: "Couldn't load this creative's copy" }, { status: 500 });
  }
  const fields = (latestCopy?.fields ?? {}) as Record<string, string>;
  // Whatever fields this format's own copy actually uses (lib/formats.ts) —
  // not a fixed caption/headline/cta triple, which only exists for some
  // formats (Meta Feed Ad, say, has primary/headline/description/cta and
  // no "caption" at all — hardcoding those three silently found nothing
  // for it and this route reported "No copy to analyse yet" for every
  // format that isn't caption/headline/cta shaped). Same field-plus-label
  // join CreativeModal.tsx's own copyTextForCheck uses client-side.
  const copyFieldSpecs = (formatById(creative.format)?.copyFields ?? []).map((key) => ({
    key,
    label: COPY_FIELD_LABELS[key] ?? key,
  }));
  const copyText = copyFieldSpecs
    .map((spec) => (fields[spec.key] ? `${spec.label}: ${fields[spec.key]}` : null))
    .filter((line): line is string => !!line)
    .join("\n");
  if (!copyText.trim()) {
    return NextResponse.json({ error: "No copy to analyse yet" }, { status: 400 });
  }

  const prompt = [
    "You analyse ad/social copy for its WIIFM (\"what's in it for me\") angle —",
    "what the reader actually gets, not what the brand is saying about itself.",
    creative.concept ? `The brief's concept: ${creative.concept}` : null,
    `The copy:\n${copyText}`,
    "",
    "List, one per line, the specific things a reader gets from this copy.",
    "Plain, concrete statements only — no preamble, no numbering, no markdown.",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await runAiTask(supabase, agencyId, user.id, prompt);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const approachNotes = (result.text ?? "")
    .split("\n")
    .map((line) => line.replace(/^[-•\d.)\s]+/, "").trim())
    .filter(Boolean);

  const { data, error } = await supabase
    .from("creatives")
    .update({ approach_notes: approachNotes })
    .eq("id", creativeId)
    .select("id")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Couldn't save the WIIFM note" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "You don't have permission to edit this creative." },
      { status: 403 },
    );
  }

  return NextResponse.json({ approachNotes });
}
