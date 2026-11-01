import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAiTask } from "@/lib/ai/run-ai-task";
import type { Attachment } from "@/lib/ai/attachment";
import { loadArtworkImage } from "@/lib/ai/artwork-image";
import { modelById } from "@/lib/ai/models";
import { buildCreativeCheckPrompt, creativeCheckFindings, type CreativeCheckSlide } from "@/lib/ai/build-creative-check-prompt";
import { CREATIVE_VERSIONS_SELECT, versionSlides, type CreativeVersionRow } from "@/lib/creative-queries";
import { frameLimits, postFormats } from "@/lib/formats";

// This check's limit for all its images together, so one check's request
// (and what it costs against the cap) stays predictable.
const MAX_COMBINED_BYTES = 20 * 1024 * 1024;

// "Check Creative" (direct instruction): whether each slide of the latest
// uploaded artwork says what its Text on Image says. The team's only; one
// call through runAiTask, so the agency's monthly cap and usage log apply.
// Only Claude reads images here (lib/ai/providers), so another model is
// told so rather than sent images it would ignore.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { creativeId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!body.creativeId) return NextResponse.json({ error: "creativeId is required" }, { status: 400 });

  // Read as the caller: RLS decides whether they can see it at all.
  const { data: post } = await supabase
    .from("creatives")
    .select("id, agency_id, format, formats, slide_count, slide_text")
    .eq("id", body.creativeId)
    .maybeSingle();
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

  const { data: agency } = await supabase.from("agencies").select("ai_default_model").eq("id", post.agency_id).single();
  if (modelById(agency?.ai_default_model ?? "")?.provider !== "anthropic") {
    return NextResponse.json(
      { error: "Check Creative reads the artwork, which needs a Claude model. An Owner or Admin can choose one in Settings → AI Governance → Drafting Model." },
      { status: 400 },
    );
  }

  const { data: versions, error: versionError } = await supabase
    .from("creative_versions")
    .select(CREATIVE_VERSIONS_SELECT)
    .eq("creative_id", post.id)
    .order("version_no", { ascending: false })
    .limit(1);
  if (versionError) return NextResponse.json({ error: "Couldn't load the artwork" }, { status: 500 });
  const slides = versionSlides((versions?.[0] ?? null) as unknown as CreativeVersionRow | null);

  const formats = postFormats({ format: post.format, formats: post.formats });
  const frames = frameLimits(formats);
  const noun = frames?.noun ?? "Image";
  const texts = ((post.slide_text ?? []) as string[]).map((t) => t ?? "");
  const count = frames
    ? Math.min(Math.max(post.slide_count ?? frames.min, frames.min, slides.length), frames.max)
    : 1;
  if (!slides.length) return NextResponse.json({ error: "Upload the artwork first, then check it." }, { status: 400 });
  if (!texts.some((t) => t.trim())) {
    return NextResponse.json({ error: "Write the Text on Image first, on the Production tab, then check it." }, { status: 400 });
  }

  // Each slide's image: its lighter copy, else the original if small enough.
  const checkSlides: CreativeCheckSlide[] = [];
  const attachments: Attachment[] = [];
  let combined = 0;
  for (let n = 1; n <= count; n++) {
    const slide = slides.find((s) => s.position === n);
    const text = texts[n - 1] ?? "";
    if (!slide) {
      checkSlides.push({ n, text, hasImage: false });
      continue;
    }
    if (!slide.asset.mime_type.startsWith("image/")) {
      checkSlides.push({ n, text, hasImage: false, note: `This ${noun.toLowerCase()} is a video; Check Creative reads images only.` });
      continue;
    }
    const image = await loadArtworkImage(supabase, slide.asset.storage_key);
    const bytes = image?.bytes ?? null;
    const mediaType = image?.mediaType ?? null;
    if (!bytes || !mediaType || combined + bytes.length > MAX_COMBINED_BYTES) {
      checkSlides.push({
        n,
        text,
        hasImage: false,
        note: `Frank couldn't read this ${noun.toLowerCase()}'s artwork: it may be too large. Saving it again makes a lighter copy.`,
      });
      continue;
    }
    combined += bytes.length;
    attachments.push({ base64: Buffer.from(bytes).toString("base64"), mediaType, title: `${noun} ${n}` });
    checkSlides.push({ n, text, hasImage: true });
  }

  if (!attachments.length) {
    return NextResponse.json({ findings: creativeCheckFindings(checkSlides, "", noun) });
  }
  const result = await runAiTask(supabase, post.agency_id, user.id, buildCreativeCheckPrompt(checkSlides, noun), attachments);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ findings: creativeCheckFindings(checkSlides, result.text ?? "", noun) });
}
