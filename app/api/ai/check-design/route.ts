import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAiTask } from "@/lib/ai/run-ai-task";
import type { Attachment } from "@/lib/ai/attachment";
import { loadArtworkImage } from "@/lib/ai/artwork-image";
import { modelById } from "@/lib/ai/models";
import { buildDesignCheckPrompt, designCheckFindings } from "@/lib/ai/build-design-check-prompt";
import { CREATIVE_VERSIONS_SELECT, versionSlides, type CreativeVersionRow } from "@/lib/creative-queries";
import { frameLimits, postFormats } from "@/lib/formats";
import { KNOWLEDGE_SECTIONS } from "@/lib/knowledge-sections";

// This check's limit for all its images together, so one check's request
// (and what it costs against the cap) stays predictable.
const MAX_COMBINED_BYTES = 20 * 1024 * 1024;
// The post's own slides read, at most (decided directly: the client's last
// 10 Approved or Live posts, the first image of each).
const MAX_SLIDES = 10;
const EARLIER_POSTS = 10;
// Approved and Live.
const DONE_STAGES = [5, 6];

const SECTION_LABELS: Record<string, string> = Object.fromEntries(KNOWLEDGE_SECTIONS.map((s) => [s.key, s.label]));

// "Check Design" (direct instruction): the latest artwork's logo size and
// position and its fonts against the client's last 10 Approved or Live
// posts (fonts against the brand's own where Client Knowledge names them),
// and the basics of visual hierarchy. The team's only; one call through
// runAiTask, so the agency's monthly cap and usage log apply. Claude only,
// as Check Creative: the other providers don't send images.
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
    .select("id, agency_id, project_id, format, formats, projects(client_id)")
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
      { error: "Check Design reads the artwork, which needs a Claude model. An Owner or Admin can choose one in Settings → AI Governance → Drafting Model." },
      { status: 400 },
    );
  }

  const { data: versions } = await supabase
    .from("creative_versions")
    .select(CREATIVE_VERSIONS_SELECT)
    .eq("creative_id", post.id)
    .order("version_no", { ascending: false })
    .limit(1);
  const slides = versionSlides((versions?.[0] ?? null) as unknown as CreativeVersionRow | null)
    .filter((s) => s.asset.mime_type.startsWith("image/"))
    .slice(0, MAX_SLIDES);
  if (!slides.length) return NextResponse.json({ error: "Upload the artwork first, then check it." }, { status: 400 });

  const noun = frameLimits(postFormats({ format: post.format, formats: post.formats }))?.noun ?? "Image";
  const clientId = (post.projects as unknown as { client_id: string } | null)?.client_id ?? null;
  const attachments: Attachment[] = [];
  let combined = 0;
  const add = (image: { bytes: Uint8Array; mediaType: Attachment["mediaType"] } | null, title: string) => {
    if (!image || combined + image.bytes.length > MAX_COMBINED_BYTES) return false;
    combined += image.bytes.length;
    attachments.push({ base64: Buffer.from(image.bytes).toString("base64"), mediaType: image.mediaType, title });
    return true;
  };

  // The client's logo, to recognise it by.
  let hasLogo = false;
  if (clientId) {
    const { data: client } = await supabase.from("clients").select("logo_asset_id").eq("id", clientId).maybeSingle();
    if (client?.logo_asset_id) {
      const { data: logo } = await supabase.from("assets").select("storage_key").eq("id", client.logo_asset_id).maybeSingle();
      if (logo) hasLogo = add(await loadArtworkImage(supabase, logo.storage_key), "Client logo");
    }
  }

  // The post's own slides, numbered as the team numbers them.
  let shown = 0;
  for (const s of slides) {
    if (add(await loadArtworkImage(supabase, s.asset.storage_key), `${noun} ${shown + 1}`)) shown++;
  }
  if (!shown) {
    return NextResponse.json(
      { error: "Frank couldn't read this post's artwork: it may be too large. Saving it again makes a lighter copy." },
      { status: 400 },
    );
  }

  // The client's most recent Approved or Live posts, the first image of
  // each, newest first.
  let earlier = 0;
  if (clientId) {
    const { data: projects } = await supabase.from("projects").select("id").eq("client_id", clientId).is("archived_at", null);
    const projectIds = (projects ?? []).map((p) => p.id);
    if (projectIds.length) {
      const { data: done } = await supabase
        .from("creatives")
        .select("id, scheduled_at, due_on, updated_at")
        .in("project_id", projectIds)
        .in("stage", DONE_STAGES)
        .is("exception", null)
        .is("archived_at", null)
        .neq("id", post.id)
        .order("updated_at", { ascending: false })
        .limit(100);
      const when = (c: { scheduled_at: string | null; due_on: string | null; updated_at: string }) =>
        new Date(c.scheduled_at ?? (c.due_on ? `${c.due_on}T00:00:00` : c.updated_at)).getTime();
      const ordered = (done ?? []).sort((a, b) => when(b) - when(a));
      const ids = ordered.map((c) => c.id);
      if (ids.length) {
        const { data: theirVersions } = await supabase
          .from("creative_versions")
          .select(`creative_id, ${CREATIVE_VERSIONS_SELECT}`)
          .in("creative_id", ids)
          .order("version_no", { ascending: false });
        const latest = new Map<string, CreativeVersionRow>();
        for (const v of (theirVersions ?? []) as unknown as (CreativeVersionRow & { creative_id: string })[]) {
          if (!latest.has(v.creative_id)) latest.set(v.creative_id, v);
        }
        for (const id of ids) {
          if (earlier >= EARLIER_POSTS) break;
          const first = versionSlides(latest.get(id)).find((s) => s.asset.mime_type.startsWith("image/"));
          if (first && add(await loadArtworkImage(supabase, first.asset.storage_key), `Earlier post ${earlier + 1}`)) earlier++;
        }
      }
    }
  }

  // Everything written in the client's Knowledge, where the brand's fonts
  // would be named.
  const { data: notes } = clientId
    ? await supabase.from("knowledge_entries").select("section, body").eq("client_id", clientId).eq("kind", "text")
    : { data: [] as { section: string; body: string | null }[] };
  const brandNotes = (notes ?? [])
    .filter((n) => n.body?.trim())
    .map((n) => `[${SECTION_LABELS[n.section] ?? n.section}] ${n.body!.trim()}`);

  const prompt = buildDesignCheckPrompt({ noun, slides: shown, earlier, hasLogo, brandNotes });
  const result = await runAiTask(supabase, post.agency_id, user.id, "check_design", prompt, attachments);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ findings: designCheckFindings(result.text ?? ""), compared: earlier });
}
