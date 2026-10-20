import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAiTask } from "@/lib/ai/run-ai-task";
import { IMAGE_TYPES, type Attachment } from "@/lib/ai/attachment";
import { buildDesignDirectionPrompt, parseDesignDirection, type DesignReference } from "@/lib/ai/design-direction";
import { clientContext, loadKnowledgeFiles } from "@/lib/ai/client-context";
import { fetchImage, readPreview } from "@/lib/link-fetch";
import { fetchableUrl } from "@/lib/link-preview";
import { monthOf, strategyForPrompt, type StrategyFields } from "@/lib/monthly-strategy";
import { formatsLabel, frameLimits, hasVideoFormat, postFormats } from "@/lib/formats";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

// References read in one request: the first 8 links, and the post's
// pasted images (up to 8, phase111). Their images together stay within
// 15MB, so the request stays within the provider's size limit; the rest
// are named as skipped.
const MAX_REFERENCES = 8;
const MAX_REFERENCE_IMAGE_BYTES = 15 * 1024 * 1024;

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

  let body: {
    creativeId?: string;
    concept?: string;
    referenceUrls?: unknown;
    slideCount?: unknown;
    // A post not yet made (direct instruction: Save Concept locks the
    // concept in before Create Post): its project, name and formats, and
    // the images pasted into its References, as they are in the window.
    projectId?: string;
    // From the Concept, or a rework of the window's Notes for Designer.
    mode?: string;
    notes?: { overall?: unknown; slides?: unknown };
    name?: string;
    formats?: unknown;
    images?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return fail("Invalid request", 400);
  }

  // The post: saved, or as it is in a New Post window.
  let post: {
    id: string | null;
    agencyId: string;
    clientId: string | null;
    name: string;
    concept: string;
    approachNotes: string[];
    format: string;
    formats: string[] | null;
    slideCount: number | null;
    slideText: string[];
    referenceUrls: string[];
    when: string | null;
  };
  if (body.creativeId) {
    const { data: creative } = await supabase
      .from("creatives")
      .select(
        "id, agency_id, name, concept, approach_notes, format, formats, slide_count, slide_text, reference_urls, scheduled_at, due_on, project:projects(client_id)",
      )
      .eq("id", body.creativeId)
      .maybeSingle();
    if (!creative) return fail("Post not found", 404);
    post = {
      id: creative.id as string,
      agencyId: creative.agency_id as string,
      clientId: (creative.project as unknown as { client_id: string } | null)?.client_id ?? null,
      name: creative.name as string,
      concept: (creative.concept as string | null) ?? "",
      approachNotes: (creative.approach_notes as string[] | null) ?? [],
      format: creative.format as string,
      formats: (creative.formats as string[] | null) ?? null,
      slideCount: (creative.slide_count as number | null) ?? null,
      slideText: (creative.slide_text as string[] | null) ?? [],
      referenceUrls: (creative.reference_urls as string[] | null) ?? [],
      when: ((creative.scheduled_at as string | null) ?? (creative.due_on as string | null)) || null,
    };
  } else {
    const { data: project } = await supabase.from("projects").select("id, agency_id, client_id").eq("id", body.projectId ?? "").maybeSingle();
    if (!project) return fail("Project not found", 404);
    const formats = (Array.isArray(body.formats) ? body.formats : []).filter((f): f is string => typeof f === "string");
    if (!formats.length) return fail("Choose a format first", 400);
    post = {
      id: null,
      agencyId: project.agency_id as string,
      clientId: (project.client_id as string | null) ?? null,
      name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : "New post",
      concept: "",
      approachNotes: [],
      format: formats[0],
      formats,
      slideCount: null,
      slideText: [],
      referenceUrls: [],
      when: null,
    };
  }
  const agencyId = post.agencyId;
  const clientId = post.clientId;

  const { data: membership } = await supabase
    .from("memberships")
    .select("client_id")
    .eq("agency_id", agencyId)
    .eq("user_id", user.id)
    .is("removed_at", null)
    .maybeSingle();
  if (!membership || membership.client_id !== null) return fail("Staff access required", 403);

  // The brief as it is in the window.
  const concept = typeof body.concept === "string" ? body.concept.trim() : post.concept;
  const urls = (Array.isArray(body.referenceUrls) ? body.referenceUrls : post.referenceUrls)
    .filter((u): u is string => typeof u === "string" && !!u.trim())
    .map((u) => u.trim());
  // The post's pasted reference images (phase111), oldest first: from
  // storage on a saved post, sent with the request on a new one.
  const { data: pasted } = post.id
    ? await supabase.from("reference_images").select("asset_id, created_at").eq("creative_id", post.id).order("created_at")
    : { data: [] as Row[] };
  const { data: pastedAssets } = pasted?.length
    ? await supabase.from("assets").select("id, storage_key, mime_type, bytes").in("id", pasted.map((p) => p.asset_id as string))
    : { data: [] as Row[] };
  const sentImages = (Array.isArray(body.images) ? body.images : [])
    .filter(
      (img): img is { mediaType: string; base64: string } =>
        !!img &&
        typeof img.base64 === "string" &&
        IMAGE_TYPES.includes(img.mediaType as (typeof IMAGE_TYPES)[number]),
    )
    .slice(0, MAX_REFERENCES);
  const pastedFiles: { key: string | null; mediaType: string; load: () => Promise<Buffer | null> }[] = post.id
    ? (pasted ?? []).flatMap((p) => {
        const a = (pastedAssets ?? []).find((x) => x.id === p.asset_id);
        if (!a) return [];
        const key = a.storage_key as string;
        return [
          {
            key,
            mediaType: a.mime_type as string,
            load: async () => {
              const { data } = await supabase.storage.from("assets").download(key);
              return data ? Buffer.from(await data.arrayBuffer()) : null;
            },
          },
        ];
      })
    : sentImages.map((img) => ({ key: null, mediaType: img.mediaType, load: async () => Buffer.from(img.base64, "base64") }));
  if (!concept && !urls.length && !pastedFiles.length) return fail("Write a concept or add a reference first", 400);
  const mode = body.mode === "rework" ? "rework" : "concept";
  const notes = {
    overall: typeof body.notes?.overall === "string" ? body.notes.overall : "",
    slides: (Array.isArray(body.notes?.slides) ? body.notes.slides : []).filter((t): t is string => typeof t === "string"),
  };
  if (mode === "rework" && !notes.overall.trim() && !notes.slides.some((t) => t.trim())) {
    return fail("Write some Notes for Designer first", 400);
  }

  const formats = postFormats({ format: post.format, formats: post.formats });
  const frames = frameLimits(formats);
  const askedCount = typeof body.slideCount === "number" ? body.slideCount : post.slideCount;
  const slideCount = frames ? Math.min(Math.max(askedCount ?? frames.min, frames.min), frames.max) : null;
  const isVideo = hasVideoFormat(formats);

  // Each reference's page, then its preview image, all at once.
  const chosenUrls = urls.slice(0, MAX_REFERENCES);
  const previews = await Promise.all(chosenUrls.map((u) => readPreview(fetchableUrl(u) ? u : `https://${u}`)));
  const images = await Promise.all(previews.map((p) => (p?.image ? fetchImage(p.image) : Promise.resolve(null))));
  const pastedBytes = await Promise.all(pastedFiles.map((f) => f.load()));
  // Every image, links' first, within the size budget.
  let budget = MAX_REFERENCE_IMAGE_BYTES;
  const skippedRefs: string[] = [];
  const fits = (bytes: number, name: string) => {
    if (bytes > budget) {
      skippedRefs.push(name);
      return false;
    }
    budget -= bytes;
    return true;
  };
  const linkImages = images.map((img, i) => (img && fits(img.bytes.length, `Reference ${i + 1}`) ? img : null));
  const pastedImages = await Promise.all(
    pastedFiles.map(async (f, i) => {
      const bytes = pastedBytes[i];
      if (!bytes || !IMAGE_TYPES.includes(f.mediaType as (typeof IMAGE_TYPES)[number])) return null;
      const n = chosenUrls.length + i + 1;
      return fits(bytes.length, `Reference ${n}`) ? bytes : null;
    }),
  );
  const references: DesignReference[] = [
    ...chosenUrls.map((url, i) => ({
      n: i + 1,
      url,
      title: previews[i]?.title ?? null,
      description: previews[i]?.description ?? null,
      siteName: previews[i]?.siteName ?? null,
      hasImage: !!linkImages[i],
    })),
    ...pastedFiles.map((_, i) => ({
      n: chosenUrls.length + i + 1,
      url: null,
      title: null,
      description: null,
      siteName: null,
      hasImage: !!pastedImages[i],
    })),
  ];
  const referenceImages: Attachment[] = [
    ...linkImages.flatMap((img, i) =>
      img ? [{ base64: img.bytes.toString("base64"), mediaType: img.mediaType, title: `Reference ${i + 1}` }] : [],
    ),
    ...pastedImages.flatMap((bytes, i) =>
      bytes
        ? [{ base64: bytes.toString("base64"), mediaType: pastedFiles[i].mediaType as Attachment["mediaType"], title: `Reference ${chosenUrls.length + i + 1}` }]
        : [],
    ),
  ];
  // What's saved with the direction, for its cards: a link's page and
  // image, or a pasted image's file.
  const refs = references.map((r, i) =>
    r.url
      ? { n: r.n, url: r.url, title: r.title, image: previews[i]?.image ?? null, read: !!(previews[i] || images[i]) }
      : {
          n: r.n,
          url: null,
          title: "Pasted image",
          image: null,
          // A saved image's file; a new post's by its place among the
          // pasted ones, until Create Post saves them.
          ...(pastedFiles[i - chosenUrls.length].key
            ? { assetKey: pastedFiles[i - chosenUrls.length].key }
            : { pendingIndex: i - chosenUrls.length }),
          read: r.hasImage,
        },
  );

  const strategyMonth = monthOf(post.when ?? new Date());
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
    ? await clientContext(supabase, clientId, post.id ?? "00000000-0000-0000-0000-000000000000")
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
    postName: post.name,
    formatLabel: formatsLabel(formats),
    concept: concept || null,
    approachNotes: post.approachNotes,
    formatDirection: formatDirection || null,
    slideCount,
    frameNoun: frames?.noun ?? "Slide",
    isVideo,
    textOnImage: post.slideText,
    strategy: strategyForPrompt(strategyMonth, strategy.data as Partial<StrategyFields> | null),
    agencyNotes: textNotes(agencyKnowledge.data as Row[] | null),
    clientNotes: textNotes(clientKnowledge.data as Row[] | null),
    fileTitles: knowledgeFiles.map((a) => a.title),
    clientFeedback,
    references,
    mode,
    notes,
  });

  // From here the answer streams back as Frank writes it (direct
  // instruction), one JSON line per event: the references first, then the
  // text as it comes, then the saved direction's id, or what went wrong.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        send({ type: "refs", refs });
        const result = await runAiTask(supabase, agencyId, user.id, prompt, [...referenceImages, ...knowledgeFiles], (text) =>
          send({ type: "text", text }),
        );
        if (!result.ok || !result.text) {
          send({ type: "error", error: result.error ?? "Frank didn't answer" });
          return;
        }
        const parsed = parseDesignDirection(result.text, slideCount, isVideo);
        const direction = parsed && { ...parsed, mode };
        if (!direction) {
          send({ type: "error", error: "Frank's answer couldn't be read. Try again." });
          return;
        }
        // A new post's direction stays in its window until Create Post
        // saves it with the post.
        if (!post.id) {
          send({ type: "done", id: null, direction, refs, skippedFiles: [...skippedRefs, ...skipped] });
          return;
        }
        const { data: saved, error } = await supabase
          .from("design_directions")
          .insert({ creative_id: post.id, body: direction, refs, created_by: user.id })
          .select("id")
          .single();
        if (error || !saved) {
          send({ type: "error", error: `Frank answered, but the direction couldn't be kept: ${error?.message ?? "no row"}` });
          return;
        }
        send({ type: "done", id: saved.id, skippedFiles: [...skippedRefs, ...skipped] });
      } catch (e) {
        send({ type: "error", error: e instanceof Error ? e.message : "Frank didn't answer" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
