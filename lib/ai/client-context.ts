import type { SupabaseClient } from "@supabase/supabase-js";
import { IMAGE_TYPES, withinPdfPageBudget, type Attachment } from "@/lib/ai/attachment";
import { COPY_FIELD_LABELS, formatsLabel, postFormats } from "@/lib/formats";
import {
  feedbackSince,
  pickClientFeedback,
  pickOtherPosts,
  postsSince,
  type FeedbackSetting,
  type PostRow,
  type PostsSetting,
} from "@/lib/ai/copy-chat-context";
import { ISSUE_CATEGORIES } from "@/lib/ai/build-classify-comment-prompt";
import { STAGE } from "@/lib/stage-labels";

// What Frank reads about a client beyond the post itself, shared by Draft
// with Frank (app/api/ai/copy-chat) and Design with Frank
// (app/api/ai/design-direction). Always read through the caller's own
// session, so RLS decides what they can draw on.

type Row = Record<string, unknown>;

// Knowledge files sent with a request (decided directly: PDFs and
// images). Capped so one request can't become enormous: the rest are named
// as skipped.
const MAX_FILES = 10;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;
const READABLE = new Set<string>(["application/pdf", ...IMAGE_TYPES]);

// The file-kind entries among these knowledge entries, loaded within the
// caps.
export async function loadKnowledgeFiles(
  supabase: SupabaseClient,
  entries: Row[],
): Promise<{ attachments: Attachment[]; skipped: string[] }> {
  const fileRows = entries.filter((e) => e.kind === "file" && e.asset_id);
  const attachments: Attachment[] = [];
  const skipped: string[] = [];
  if (fileRows.length) {
    const { data: assets } = await supabase
      .from("assets")
      .select("id, storage_key, mime_type, bytes, filename")
      .in("id", fileRows.map((e) => e.asset_id as string));
    // Which files go, within the caps, then all of them fetched at once
    // rather than one after another (direct instruction: it was slow).
    let total = 0;
    const chosen: { title: string; key: string; mediaType: Attachment["mediaType"] }[] = [];
    for (const entry of fileRows) {
      const asset = (assets ?? []).find((a) => a.id === entry.asset_id);
      const title = (entry.title as string) || (asset?.filename as string) || "File";
      if (!asset || !READABLE.has(asset.mime_type as string)) continue;
      const bytes = Number(asset.bytes);
      if (chosen.length >= MAX_FILES || bytes > MAX_FILE_BYTES || total + bytes > MAX_TOTAL_BYTES) {
        skipped.push(title);
        continue;
      }
      total += bytes;
      chosen.push({ title, key: asset.storage_key as string, mediaType: asset.mime_type as Attachment["mediaType"] });
    }
    const blobs = await Promise.all(chosen.map((c) => supabase.storage.from("assets").download(c.key)));
    const loaded: { title: string; mediaType: Attachment["mediaType"]; bytes: Uint8Array }[] = [];
    for (const [i, c] of chosen.entries()) {
      const blob = blobs[i].data;
      if (!blob) {
        skipped.push(c.title);
        continue;
      }
      loaded.push({ title: c.title, mediaType: c.mediaType, bytes: new Uint8Array(await blob.arrayBuffer()) });
    }
    // Within the provider's PDF page limit (reported directly: a long book
    // among the files failed every message).
    const { kept, skipped: tooLong } = withinPdfPageBudget(loaded);
    skipped.push(...tooLong.map((f) => f.title));
    for (const f of kept) {
      attachments.push({ base64: Buffer.from(f.bytes).toString("base64"), mediaType: f.mediaType, title: f.title });
    }
  }
  return { attachments, skipped };
}

// Read through the person's own session, so it's only ever what they can
// see. What reaches back how far is the client's choice in Preferences
// (phase89): posts are its Approved ones (direct instruction), the newest
// 40 approved since then, of which the picker keeps 8 with words;
// feedback is public comments on any of its posts since then, of which the
// picker keeps the client's own. Either can be off.
export async function clientContext(supabase: SupabaseClient, clientId: string, creativeId: string) {
  const now = new Date();
  const { data: prefs } = await supabase
    .from("client_preferences")
    .select("frank_posts, frank_feedback")
    .eq("client_id", clientId)
    .maybeSingle();
  const postsSetting = ((prefs?.frank_posts as PostsSetting | undefined) ?? "12m") as PostsSetting;
  const feedbackSetting = ((prefs?.frank_feedback as FeedbackSetting | undefined) ?? "90d") as FeedbackSetting;
  const postsFrom = postsSince(postsSetting, now);
  const feedbackFrom = feedbackSince(feedbackSetting, now);

  const [projects, people, comments] = await Promise.all([
    postsSetting === "off" ? Promise.resolve({ data: [] as Row[] }) : supabase.from("projects").select("id").eq("client_id", clientId),
    supabase.from("memberships").select("user_id").eq("client_id", clientId),
    feedbackSetting === "off"
      ? Promise.resolve({ data: [] as Row[] })
      : (() => {
          let q = supabase
            .from("comments")
            .select("body, created_at, author_id, guest_name, issue_category, creative:creatives!inner(name, project:projects!inner(client_id))")
            .eq("creative.project.client_id", clientId)
            .is("deleted_at", null)
            .eq("visibility", "public");
          if (feedbackFrom) q = q.gte("created_at", feedbackFrom.toISOString());
          return q.order("created_at", { ascending: false }).limit(100);
        })(),
  ]);
  const projectIds = (projects.data ?? []).map((p) => p.id as string);
  const { data: posts } = projectIds.length
    ? await (() => {
        let q = supabase
          .from("creatives")
          .select("id, name, stage, format, formats, voiceover, slide_text, updated_at, approved_at")
          .in("project_id", projectIds)
          .gte("stage", STAGE.approved)
          .is("archived_at", null)
          .neq("id", creativeId);
        if (postsFrom) q = q.gte("approved_at", postsFrom.toISOString());
        return q.order("approved_at", { ascending: false, nullsFirst: false }).limit(40);
      })()
    : { data: [] as Row[] };
  const postIds = (posts ?? []).map((p) => p.id as string);
  const { data: copies } = postIds.length
    ? await supabase.from("copy_versions").select("creative_id, created_at, fields").in("creative_id", postIds)
    : { data: [] as Row[] };

  const otherPosts = pickOtherPosts(
    (posts ?? []).map((p) => ({
      id: p.id as string,
      name: p.name as string,
      stage: p.stage as number,
      formatLabel: formatsLabel(postFormats(p as { format: string; formats: string[] | null })),
      updated_at: p.updated_at as string,
      approved_at: (p.approved_at as string | null) ?? null,
      voiceover: (p.voiceover as string | null) ?? null,
      slide_text: (p.slide_text as string[] | null) ?? null,
    })) satisfies PostRow[],
    (copies ?? []) as { creative_id: string; created_at: string; fields: Record<string, unknown> | null }[],
    COPY_FIELD_LABELS,
    postsFrom,
  );
  const clientFeedback = pickClientFeedback(
    (comments.data ?? []).map((c) => ({
      body: c.body as string,
      created_at: c.created_at as string,
      author_id: (c.author_id as string | null) ?? null,
      guest_name: (c.guest_name as string | null) ?? null,
      issue_category: (c.issue_category as string | null) ?? null,
      post: ((c.creative as unknown as { name: string } | null)?.name ?? "a post") as string,
    })),
    new Set((people.data ?? []).map((m) => m.user_id as string)),
    Object.fromEntries(ISSUE_CATEGORIES.map((c) => [c.key, c.label])),
    feedbackFrom,
  );
  return { otherPosts, clientFeedback };
}
