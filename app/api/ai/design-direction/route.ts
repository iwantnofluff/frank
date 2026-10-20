import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAiTask } from "@/lib/ai/run-ai-task";
import type { Attachment } from "@/lib/ai/attachment";
import { buildDesignDirectionPrompt, parseDesignDirection, type DesignReference } from "@/lib/ai/design-direction";
import { clientContext, loadKnowledgeFiles } from "@/lib/ai/client-context";
import { fetchImage, readPreview } from "@/lib/link-fetch";
import { fetchableUrl } from "@/lib/link-preview";
import { monthOf, strategyForPrompt, type StrategyFields } from "@/lib/monthly-strategy";
import { formatsLabel, frameLimits, hasVideoFormat, postFormats } from "@/lib/formats";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

// References read in one request: the first 8.
const MAX_REFERENCES = 8;

type Row = Record<string, unknown>;

// Design with Frank (phase110): a design direction for one post. Frank
// reads the brief (as it is in the window, saved or not), each reference
// link's page and preview image, and the client's knowledge, strategy and
// feedback, and writes the designer a direction. One request against the
// monthly cap, through runAiTask; kept with the post, for the team only.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Not signed in", 401);

  let body: { creativeId?: string; concept?: string; referenceUrls?: unknown; slideCount?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Invalid request", 400);
  }

  const { data: creative } = await supabase
    .from("creatives")
    .select(
      "id, agency_id, name, concept, approach_notes, format, formats, slide_count, slide_text, reference_urls, scheduled_at, due_on, project:projects(client_id)",
    )
    .eq("id", body.creativeId ?? "")
    .maybeSingle();
  if (!creative) return fail("Post not found", 404);
  const agencyId = creative.agency_id as string;
  const clientId = (creative.project as unknown as { client_id: string } | null)?.client_id ?? null;

  const { data: membership } = await supabase
    .from("memberships")
    .select("client_id")
    .eq("agency_id", agencyId)
    .eq("user_id", user.id)
    .is("removed_at", null)
    .maybeSingle();
  if (!membership || membership.client_id !== null) return fail("Staff access required", 403);

  // The brief as it is in the window.
  const concept = typeof body.concept === "string" ? body.concept.trim() : ((creative.concept as string | null) ?? "");
  const urls = (Array.isArray(body.referenceUrls) ? body.referenceUrls : ((creative.reference_urls as string[] | null) ?? []))
    .filter((u): u is string => typeof u === "string" && !!u.trim())
    .map((u) => u.trim());
  if (!concept && !urls.length) return fail("Write a concept or add a reference first", 400);

  const formats = postFormats(creative as { format: string; formats: string[] | null });
  const frames = frameLimits(formats);
  const askedCount = typeof body.slideCount === "number" ? body.slideCount : ((creative.slide_count as number | null) ?? null);
  const slideCount = frames ? Math.min(Math.max(askedCount ?? frames.min, frames.min), frames.max) : null;
  const isVideo = hasVideoFormat(formats);

  // Each reference's page, then its preview image, all at once.
  const chosenUrls = urls.slice(0, MAX_REFERENCES);
  const previews = await Promise.all(chosenUrls.map((u) => readPreview(fetchableUrl(u) ? u : `https://${u}`)));
  const images = await Promise.all(previews.map((p) => (p?.image ? fetchImage(p.image) : Promise.resolve(null))));
  const references: DesignReference[] = chosenUrls.map((url, i) => ({
    n: i + 1,
    url,
    title: previews[i]?.title ?? null,
    description: previews[i]?.description ?? null,
    siteName: previews[i]?.siteName ?? null,
    hasImage: !!images[i],
  }));
  const referenceImages: Attachment[] = images.flatMap((img, i) =>
    img ? [{ base64: img.bytes.toString("base64"), mediaType: img.mediaType, title: `Reference ${i + 1}` }] : [],
  );

  const strategyMonth = monthOf((creative.scheduled_at as string | null) ?? (creative.due_on as string | null) ?? new Date());
  const [directions, agencyKnowledge, clientKnowledge, strategy] = await Promise.all([
    supabase.from("format_directions").select("format_id, direction_text").eq("agency_id", agencyId),
    supabase.from("agency_knowledge_entries").select("kind, title, body, asset_id").eq("agency_id", agencyId).order("created_at"),
    clientId
      ? supabase.from("knowledge_entries").select("kind, title, body, asset_id").eq("client_id", clientId).order("created_at")
      : Promise.resolve({ data: [] as Row[] }),
    clientId
      ? supabase
          .from("client_monthly_strategies")
          .select("objective, key_messages, themes, offers, key_dates, notes")
          .eq("client_id", clientId)
          .eq("month", strategyMonth)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const { clientFeedback } = clientId
    ? await clientContext(supabase, clientId, creative.id as string)
    : { clientFeedback: [] };
  const { attachments: knowledgeFiles, skipped } = await loadKnowledgeFiles(supabase, [
    ...((agencyKnowledge.data ?? []) as Row[]),
    ...((clientKnowledge.data ?? []) as Row[]),
  ]);

  const formatDirection = formats
    .map((id) => {
      const text = (directions.data ?? []).find((d) => d.format_id === id)?.direction_text as string | null | undefined;
      return text ? (formats.length > 1 ? `${formatsLabel([id])}: ${text}` : text) : null;
    })
    .filter(Boolean)
    .join("\n\n");
  const textNotes = (rows: Row[] | null) =>
    (rows ?? [])
      .filter((e) => e.kind === "text" && typeof e.body === "string" && (e.body as string).trim())
      .map((e) => ({ title: e.title as string, body: (e.body as string).trim() }));

  const prompt = buildDesignDirectionPrompt({
    postName: creative.name as string,
    formatLabel: formatsLabel(formats),
    concept: concept || null,
    approachNotes: (creative.approach_notes as string[] | null) ?? [],
    formatDirection: formatDirection || null,
    slideCount,
    frameNoun: frames?.noun ?? "Slide",
    isVideo,
    textOnImage: (creative.slide_text as string[] | null) ?? [],
    strategy: strategyForPrompt(strategyMonth, strategy.data as Partial<StrategyFields> | null),
    agencyNotes: textNotes(agencyKnowledge.data as Row[] | null),
    clientNotes: textNotes(clientKnowledge.data as Row[] | null),
    fileTitles: knowledgeFiles.map((a) => a.title),
    clientFeedback,
    references,
  });

  const result = await runAiTask(supabase, agencyId, user.id, prompt, [...referenceImages, ...knowledgeFiles]);
  if (!result.ok || !result.text) return fail(result.error ?? "Frank didn't answer", result.status || 502);
  const direction = parseDesignDirection(result.text, slideCount, isVideo);
  if (!direction) return fail("Frank's answer couldn't be read. Try again.", 502);

  const refs = references.map((r, i) => ({
    n: r.n,
    url: r.url,
    title: r.title,
    image: previews[i]?.image ?? null,
    read: !!(previews[i] || images[i]),
  }));
  const { data: saved, error } = await supabase
    .from("design_directions")
    .insert({ creative_id: creative.id, body: direction, refs, created_by: user.id })
    .select("id")
    .single();
  if (error || !saved) return fail(`Frank answered, but the direction couldn't be kept: ${error?.message ?? "no row"}`, 500);

  return NextResponse.json({ id: saved.id, skippedFiles: skipped });
}
