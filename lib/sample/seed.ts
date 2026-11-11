import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { overviewHash, sectionSource } from "@/lib/strategy-overview";

// The sample client every new workspace gets (phase145, decided directly):
// Lumen Skin, a made-up skincare brand, with one Content Planner and six
// posts across the stages, to explore Frank with. Made with the service role
// by the sign-up route once the workspace exists. Marked is_sample, so it
// doesn't count towards the limits; its files sit under {agency}/sample/,
// left out of storage. Its 7 days start on the first visit
// (start_sample_clock), and the daily clean-up removes it after.

export const SAMPLE_CLIENT_NAME = "Lumen Skin";

const ART_DIR = path.join(process.cwd(), "lib/sample/art");
const DAY = 86_400_000;

// The client's own Knowledge, one entry a section, and the overview each of
// its Strategy boxes shows, saved with the fingerprint the page checks, so
// nothing is rewritten (or spends AI) on the first visit.
const KNOWLEDGE: { section: string; title: string; body: string; overview: string }[] = [
  {
    section: "about",
    title: "About Lumen Skin",
    body: "Lumen Skin makes a small range of clean, science-led skincare: a gentle gel cleanser, the Daily Glow Serum (10% niacinamide with vitamin C) and a Barrier Cream. Launching on Instagram this month. This is a sample client, made up to explore Frank with.",
    overview: "",
  },
  {
    section: "tone",
    title: "How Lumen sounds",
    body: "Warm, calm and plain-spoken. Short sentences. Explain the science simply, never with fear or hype. No exclamation marks, no 'flawless', no 'miracle'.",
    overview: "Warm, calm and plain-spoken, in short sentences. The science is explained simply, never with fear or hype, and words like flawless or miracle are off limits.",
  },
  {
    section: "audience",
    title: "Who Lumen is for",
    body: "Women and men aged 24 to 38 in Indian cities, new to a skincare routine, who want a few products that work rather than a twelve-step shelf. They read ingredient lists and distrust big claims.",
    overview: "City dwellers aged 24 to 38, new to skincare routines, who want a few products that work. They read ingredient lists and distrust big claims.",
  },
  {
    section: "features",
    title: "What to lead with",
    body: "1. The Daily Glow Serum: 10% niacinamide for even tone and calmer skin. 2. A three-step routine anyone can keep. 3. Barrier Cream for dry winter skin.",
    overview: "Lead with the Daily Glow Serum and its 10% niacinamide, then the simple three-step routine, then the Barrier Cream for dry winter skin.",
  },
];

interface SamplePost {
  name: string;
  format: string;
  stage: number;
  // Days from today it's scheduled for; null for an Idea.
  inDays: number | null;
  concept: string;
  voiceover?: string;
  caption?: string;
  slideText?: string[];
  art?: string[];
  approved?: boolean;
  // Client comments, as the client's people would leave them on the review
  // link. A quote is a highlight on that part of the caption.
  comments?: { name: string; body: string; quote?: string }[];
}

const POSTS: SamplePost[] = [
  {
    name: "Meet the Daily Glow Serum",
    format: "ig_feed",
    stage: 5,
    inDays: 2,
    concept: "Launch post for the hero product. The bottle on a warm, soft background, one line that says what it does.",
    caption:
      "Meet the Daily Glow Serum.\n\n10% niacinamide to even out tone and calm redness, with vitamin C for a brighter look. Three drops, morning and night.\n\nOut this month.",
    slideText: ["Meet your daily glow. 10% niacinamide · vitamin C"],
    art: ["serum.jpg"],
    approved: true,
  },
  {
    name: "Morning Routine in 3 Steps",
    format: "ig_carousel",
    stage: 3,
    inDays: 4,
    concept: "A carousel walking through the routine, one product a slide, so it's easy to save.",
    caption:
      "A routine you'll actually keep.\n\n1. Cleanse with the Gentle Gel Cleanser.\n2. Treat with three drops of Daily Glow Serum.\n3. Protect with Barrier Cream.\n\nSave this for tomorrow morning.",
    slideText: [
      "Step 1 of 3. Cleanse. A gentle gel wash that leaves skin soft, never tight.",
      "Step 2 of 3. Treat. Three drops of Daily Glow Serum, pressed in while skin is damp.",
      "Step 3 of 3. Protect. Seal it all in with Barrier Cream, morning and night.",
    ],
    art: ["routine-1.jpg", "routine-2.jpg", "routine-3.jpg"],
  },
  {
    name: "Why Niacinamide?",
    format: "ig_feed",
    stage: 4,
    inDays: 6,
    concept: "An explainer on the serum's main ingredient: three plain benefits, no jargon.",
    caption:
      "Why niacinamide?\n\nIt evens out tone, calms redness and strengthens your skin's barrier. Gentle enough for every day, and it plays well with the rest of your routine.\n\nThere's 10% in our Daily Glow Serum.",
    slideText: ["Why niacinamide? Evens out tone. Calms redness. Strengthens your barrier."],
    art: ["niacinamide.jpg"],
    comments: [
      {
        name: "Maya Fernandes",
        quote: "plays well with the rest of your routine",
        body: "Love this. Could we say which products it works with? People always ask about using it with vitamin C.",
      },
      {
        name: "Maya Fernandes",
        body: "The artwork is lovely. Can the drop be a touch smaller so the three points stand out more?",
      },
    ],
  },
  {
    name: "Glow in 15 Seconds",
    format: "ig_reel",
    stage: 2,
    inDays: 9,
    concept: "A quick reel of the routine in real time: wash, three drops, cream, done. Natural light, no music voiceover until the end.",
    voiceover: "Cleanse. Three drops. Seal it in. That's the whole routine.",
  },
  {
    name: "Winter Barrier Cream",
    format: "ig_feed",
    stage: 1,
    inDays: 12,
    concept: "Barrier Cream as the answer to dry winter skin. A close-up of the cream's texture, with a line on what it does overnight.",
  },
  {
    name: "Founder Q&A",
    format: "ig_reel",
    stage: 1,
    inDays: null,
    concept: "Our founder answers the five questions customers ask most. An idea for later in the month.",
  },
];

// The Project's assets: due dates, no copy or artwork yet.
const ASSETS: { name: string; format: string; stage: number; dueIn: number; concept: string }[] = [
  {
    name: "Website Banner: Serum Launch",
    format: "web_hero",
    stage: 2,
    dueIn: 5,
    concept: "The homepage banner for launch week: the serum bottle on the warm background, one line and Shop Now.",
  },
  {
    name: "Amazon A+ Module: Daily Glow",
    format: "apl_module",
    stage: 1,
    dueIn: 10,
    concept: "An A+ module under the listing: the three benefits of niacinamide, each with a small illustration.",
  },
];

// Makes the sample client in a new workspace. Never throws: a sample that
// can't be made is skipped, never a failed sign-up.
export async function seedSampleClient(
  admin: SupabaseClient,
  agencyId: string,
  ownerId: string,
  // Made hidden (an older workspace's, for the tour), or put back as it was
  // (a reset).
  state: { archived_at?: string | null; sample_expires_at?: string | null } = {},
): Promise<string | null> {
  try {
    return await seed(admin, agencyId, ownerId, state);
  } catch (e) {
    console.error("sample client:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function seed(
  admin: SupabaseClient,
  agencyId: string,
  ownerId: string,
  state: { archived_at?: string | null; sample_expires_at?: string | null },
): Promise<string> {
  const { data: client, error: clientError } = await admin
    .from("clients")
    .insert({
      agency_id: agencyId,
      name: SAMPLE_CLIENT_NAME,
      industry: "Skincare",
      description: "A made-up skincare brand to explore Frank with.",
      is_sample: true,
      archived_at: state.archived_at ?? null,
      sample_expires_at: state.sample_expires_at ?? null,
    })
    .select("id")
    .single();
  if (clientError) throw clientError;
  const clientId = client.id as string;

  // Knowledge first, a second apart so its order is fixed.
  const start = Date.now() - KNOWLEDGE.length * 1000;
  const { error: kError } = await admin.from("knowledge_entries").insert(
    KNOWLEDGE.map((k, i) => ({
      agency_id: agencyId,
      client_id: clientId,
      section: k.section,
      kind: "text",
      title: k.title,
      body: k.body,
      author_id: ownerId,
      created_at: new Date(start + i * 1000).toISOString(),
    })),
  );
  if (kError) throw kError;
  const overviews = KNOWLEDGE.filter((k) => k.overview).map((k) => ({
    agency_id: agencyId,
    client_id: clientId,
    section: k.section,
    overview: k.overview,
    source_hash: overviewHash(sectionSource([{ kind: "text", title: k.title, body: k.body }])),
  }));
  const { error: oError } = await admin.from("client_strategy_overviews").insert(overviews);
  if (oError) throw oError;

  const { data: project, error: projectError } = await admin
    .from("projects")
    .insert({ client_id: clientId, name: "Launch Month", delivery: "scheduled", type: "Launch" })
    .select("id")
    .single();
  if (projectError) throw projectError;

  const today = new Date();
  today.setUTCHours(10, 0, 0, 0);
  for (const [i, p] of POSTS.entries()) {
    await seedPost(admin, agencyId, ownerId, project.id as string, p, i, today.getTime());
  }

  // A Project too (phase146): one-off pieces by due date, for Help's Show
  // Me on Track a Project.
  const { data: assets, error: assetsError } = await admin
    .from("projects")
    .insert({ client_id: clientId, name: "Launch Assets", delivery: "continuous", type: "Web" })
    .select("id")
    .single();
  if (assetsError) throw assetsError;
  const day = (n: number) => new Date(today.getTime() + n * DAY).toISOString().slice(0, 10);
  for (const [i, a] of ASSETS.entries()) {
    const { error: assetError } = await admin.from("creatives").insert({
      project_id: assets.id,
      name: a.name,
      format: a.format,
      formats: [a.format],
      stage: a.stage,
      position: i,
      concept: a.concept,
      due_on: day(a.dueIn),
      publish_on: day(a.dueIn + 3),
      created_by: ownerId,
    });
    if (assetError) throw assetError;
  }
  return clientId;
}

async function seedPost(
  admin: SupabaseClient,
  agencyId: string,
  ownerId: string,
  projectId: string,
  p: SamplePost,
  position: number,
  todayMs: number,
) {
  const { data: post, error } = await admin
    .from("creatives")
    .insert({
      project_id: projectId,
      name: p.name,
      format: p.format,
      formats: [p.format],
      stage: p.stage,
      position,
      concept: p.concept,
      voiceover: p.voiceover ?? null,
      scheduled_at: p.inDays === null ? null : new Date(todayMs + p.inDays * DAY).toISOString(),
      slide_count: p.art && p.art.length > 1 ? p.art.length : null,
      slide_text: p.slideText ?? [],
      created_by: ownerId,
    })
    .select("id")
    .single();
  if (error) throw error;
  const creativeId = post.id as string;

  let copyVersionId: string | null = null;
  if (p.caption) {
    const { data: copy, error: copyError } = await admin
      .from("copy_versions")
      .insert({ creative_id: creativeId, version_no: 1, fields: { caption: p.caption }, source: "in_app_edit", created_by: ownerId })
      .select("id")
      .single();
    if (copyError) throw copyError;
    copyVersionId = copy.id as string;
  }

  let creativeVersionId: string | null = null;
  if (p.art?.length) {
    const assetIds: string[] = [];
    for (const file of p.art) {
      const bytes = await readFile(path.join(ART_DIR, file));
      const key = `${agencyId}/sample/${creativeId}/${crypto.randomUUID()}-${file}`;
      const { error: upError } = await admin.storage.from("assets").upload(key, bytes, { contentType: "image/jpeg" });
      if (upError) throw upError;
      const { data: asset, error: assetError } = await admin
        .from("assets")
        .insert({
          agency_id: agencyId,
          storage_key: key,
          filename: file,
          mime_type: "image/jpeg",
          bytes: bytes.length,
          width: 1080,
          height: 1350,
          created_by: ownerId,
        })
        .select("id")
        .single();
      if (assetError) throw assetError;
      assetIds.push(asset.id as string);
    }
    const { data: version, error: versionError } = await admin
      .from("creative_versions")
      .insert({ creative_id: creativeId, version_no: 1, asset_id: assetIds[0], created_by: ownerId })
      .select("id")
      .single();
    if (versionError) throw versionError;
    creativeVersionId = version.id as string;
    const { error: slidesError } = await admin
      .from("creative_version_slides")
      .insert(assetIds.map((assetId, i) => ({ creative_version_id: creativeVersionId, position: i + 1, asset_id: assetId })));
    if (slidesError) throw slidesError;
  }

  // Saving copy or artwork moves a post on to Internal Review by itself:
  // back to the stage it's meant to show.
  const { error: stageError } = await admin
    .from("creatives")
    .update({
      stage: p.stage,
      ...(p.approved ? { approved_at: new Date().toISOString(), approved_by_name: "Maya Fernandes" } : {}),
    })
    .eq("id", creativeId);
  if (stageError) throw stageError;

  for (const c of p.comments ?? []) {
    const start = c.quote && p.caption ? p.caption.indexOf(c.quote) : -1;
    const { error: commentError } = await admin.from("comments").insert({
      creative_id: creativeId,
      body: c.body,
      guest_name: c.name,
      visibility: "public",
      creative_version_id: creativeVersionId,
      copy_version_id: start >= 0 ? copyVersionId : null,
      anchor: start >= 0 ? { type: "highlight", field: "caption", quote: c.quote, start, end: start + c.quote!.length } : null,
    });
    if (commentError) throw commentError;
  }
}
