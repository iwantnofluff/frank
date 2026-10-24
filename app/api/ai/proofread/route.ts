import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAiTask } from "@/lib/ai/run-ai-task";
import { COPY_FIELD_LABELS } from "@/lib/formats";
import { buildProofreadPrompt, paragraphSuggestions, parseProofread, type ProofreadSuggestion } from "@/lib/proofread";

// Proofreads a version just saved (phase121, direct instruction): a copy
// version, or one Production field's version. The words are read here, from
// what was saved, never taken from the request. Paragraphs that run on are
// found without AI; spelling, punctuation and grammar are one request
// against the agency's monthly cap (runAiTask), told to respect the
// client's tone. The result replaces the version's proofread, so an
// earlier Ignore goes with the words it was about. The team only.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { kind?: string; versionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const kind = body.kind === "production" ? "production" : body.kind === "copy" ? "copy" : null;
  if (!kind || !body.versionId) return NextResponse.json({ error: "kind and versionId are required" }, { status: 400 });

  // The saved words, and the post they're on (RLS: the team only).
  let creativeId: string;
  const fields: { key: string; label: string; text: string }[] = [];
  // The long ones, where a paragraph can run on.
  const prose = new Set<string>();
  if (kind === "copy") {
    const { data: v } = await supabase.from("copy_versions").select("creative_id, fields").eq("id", body.versionId).maybeSingle();
    if (!v) return NextResponse.json({ error: "Version not found" }, { status: 404 });
    creativeId = v.creative_id as string;
    for (const [key, text] of Object.entries((v.fields as Record<string, string> | null) ?? {})) {
      if (typeof text !== "string" || !text.trim()) continue;
      fields.push({ key, label: COPY_FIELD_LABELS[key] ?? key, text });
      if (key !== "alt") prose.add(key);
    }
  } else {
    const { data: v } = await supabase
      .from("production_versions")
      .select("creative_id, field, body, slides")
      .eq("id", body.versionId)
      .maybeSingle();
    if (!v) return NextResponse.json({ error: "Version not found" }, { status: 404 });
    creativeId = v.creative_id as string;
    if (v.field === "slide_text") {
      ((v.slides as string[] | null) ?? []).forEach((t, i) => {
        if (t?.trim()) fields.push({ key: `slide_${i + 1}`, label: `Text on Image, Slide ${i + 1}`, text: t });
      });
    } else if ((v.body as string | null)?.trim()) {
      const key = v.field as string;
      fields.push({ key, label: key === "voiceover" ? "VO" : "Thumbnail Text on Image", text: v.body as string });
      if (key === "voiceover") prose.add(key);
    }
  }

  const { data: creative } = await supabase
    .from("creatives")
    .select("agency_id, project:projects(client_id, clients(name))")
    .eq("id", creativeId)
    .maybeSingle();
  if (!creative) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  const agencyId = creative.agency_id as string;
  const { data: membership } = await supabase
    .from("memberships")
    .select("client_id")
    .eq("agency_id", agencyId)
    .eq("user_id", user.id)
    .is("removed_at", null)
    .maybeSingle();
  if (!membership || membership.client_id !== null) return NextResponse.json({ error: "Staff access required" }, { status: 403 });

  const byKey = Object.fromEntries(fields.map((f) => [f.key, f.text]));
  let suggestions: ProofreadSuggestion[] = fields.filter((f) => prose.has(f.key)).flatMap((f) => paragraphSuggestions(f.key, f.text));

  if (fields.length) {
    const project = creative.project as unknown as { client_id: string; clients: { name: string } | null } | null;
    const { data: tone } = project?.client_id
      ? await supabase.from("knowledge_entries").select("title, body").eq("client_id", project.client_id).eq("section", "tone").limit(10)
      : { data: [] };
    const prompt = buildProofreadPrompt({
      fields,
      clientName: project?.clients?.name ?? null,
      toneOfVoice: (tone ?? []).map((t) => [t.title, t.body].filter(Boolean).join(": ").slice(0, 600)).filter(Boolean),
    });
    const result = await runAiTask(supabase, agencyId, user.id, prompt);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    suggestions = [...parseProofread(result.text ?? "", byKey), ...suggestions];
  }

  const { error } = await supabase
    .from("proofreads")
    .upsert(
      { creative_id: creativeId, kind, version_id: body.versionId, suggestions, ignored: [], created_by: user.id },
      { onConflict: "version_id" },
    );
  if (error) return NextResponse.json({ error: "Couldn't keep the proofread" }, { status: 500 });
  return NextResponse.json({ suggestions });
}
