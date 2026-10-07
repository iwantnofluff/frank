import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAiTask } from "@/lib/ai/run-ai-task";
import { IMAGE_TYPES, type Attachment } from "@/lib/ai/attachment";
import {
  buildCopyChatPrompt,
  openingMessage,
  parseCopyChatReply,
  slideTextFields,
  type CopyChatMode,
  type CopyChatTurn,
} from "@/lib/ai/copy-chat";
import { COPY_FIELD_LABELS, copyFieldsFor, formatsLabel, postFormats } from "@/lib/formats";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

// Knowledge files sent with each message (decided directly: PDFs and
// images). Capped so one message can't become enormous: the rest are named
// as skipped.
const MAX_FILES = 10;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;
const READABLE = new Set<string>(["application/pdf", ...IMAGE_TYPES]);

type Row = Record<string, unknown>;

// "Write with Claude" (phase52): one message in a conversation about a
// post's copy. Starts one (mode: draft or review) or continues one
// (chatId). The context is gathered here every time, through the caller's
// own session, so RLS decides what they can draw on: the brief, WIIFM,
// each format's direction, agency and client knowledge (text and files).
// The reply goes through runAiTask: one request against the monthly cap.
// Both sides are saved only once Claude has answered.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Not signed in", 401);

  let body: {
    creativeId?: string;
    chatId?: string;
    mode?: CopyChatMode;
    message?: string;
    currentFields?: Record<string, string>;
  };
  try {
    body = await request.json();
  } catch {
    return fail("Invalid request", 400);
  }
  const currentFields = Object.fromEntries(
    Object.entries(body.currentFields ?? {}).filter((e): e is [string, string] => typeof e[1] === "string"),
  );

  const { data: creative } = await supabase
    .from("creatives")
    .select("id, agency_id, name, concept, approach_notes, format, formats, slide_count, project:projects(client_id)")
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

  const formats = postFormats(creative as { format: string; formats: string[] | null });
  // The formats' copy fields, then the Text on Image (one per slide).
  const fields = [
    ...copyFieldsFor(formats).map((key) => ({ key, label: COPY_FIELD_LABELS[key] ?? key })),
    ...slideTextFields((creative.slide_count as number | null) ?? null),
  ];

  // The conversation: an existing one, or a new one's opening.
  let chatId = body.chatId ?? null;
  let history: CopyChatTurn[] = [];
  let message: string;
  if (chatId) {
    const { data: chat } = await supabase.from("copy_chats").select("id, creative_id").eq("id", chatId).maybeSingle();
    if (!chat || chat.creative_id !== creative.id) return fail("Conversation not found", 404);
    const { data: past } = await supabase
      .from("copy_chat_messages")
      .select("role, body")
      .eq("chat_id", chatId)
      .order("created_at");
    history = (past ?? []) as CopyChatTurn[];
    message = body.message?.trim() ?? "";
    if (!message) return fail("Write a message", 400);
    if (message.length > 4000) return fail("Keep a message under 4,000 characters", 400);
  } else {
    if (body.mode !== "draft" && body.mode !== "review") return fail("Choose to draft or review", 400);
    if (body.mode === "review" && !fields.some((f) => currentFields[f.key]?.trim())) {
      return fail("Write a first draft to review", 400);
    }
    message = openingMessage(body.mode, currentFields, fields);
  }

  // The context.
  const [directions, agencyKnowledge, clientKnowledge] = await Promise.all([
    supabase.from("format_directions").select("format_id, direction_text").eq("agency_id", agencyId),
    supabase.from("agency_knowledge_entries").select("kind, title, body, asset_id").eq("agency_id", agencyId).order("created_at"),
    clientId
      ? supabase.from("knowledge_entries").select("kind, title, body, asset_id").eq("client_id", clientId).order("created_at")
      : Promise.resolve({ data: [] as Row[] }),
  ]);
  const direction = formats
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

  // Files: PDFs and images, within the caps.
  const fileRows = [...(agencyKnowledge.data ?? []), ...((clientKnowledge.data ?? []) as Row[])].filter(
    (e) => e.kind === "file" && e.asset_id,
  );
  const attachments: Attachment[] = [];
  const skipped: string[] = [];
  if (fileRows.length) {
    const { data: assets } = await supabase
      .from("assets")
      .select("id, storage_key, mime_type, bytes, filename")
      .in("id", fileRows.map((e) => e.asset_id as string));
    let total = 0;
    for (const entry of fileRows) {
      const asset = (assets ?? []).find((a) => a.id === entry.asset_id);
      const title = (entry.title as string) || (asset?.filename as string) || "File";
      if (!asset || !READABLE.has(asset.mime_type as string)) continue;
      const bytes = Number(asset.bytes);
      if (attachments.length >= MAX_FILES || bytes > MAX_FILE_BYTES || total + bytes > MAX_TOTAL_BYTES) {
        skipped.push(title);
        continue;
      }
      const { data: blob } = await supabase.storage.from("assets").download(asset.storage_key as string);
      if (!blob) {
        skipped.push(title);
        continue;
      }
      total += bytes;
      attachments.push({
        base64: Buffer.from(await blob.arrayBuffer()).toString("base64"),
        mediaType: asset.mime_type as Attachment["mediaType"],
        title,
      });
    }
  }

  const prompt = buildCopyChatPrompt(
    {
      postName: creative.name as string,
      concept: (creative.concept as string | null) ?? null,
      approachNotes: (creative.approach_notes as string[] | null) ?? [],
      formatLabel: formatsLabel(formats),
      formatDirection: direction || null,
      agencyNotes: textNotes(agencyKnowledge.data as Row[] | null),
      clientNotes: textNotes(clientKnowledge.data as Row[] | null),
      fileTitles: attachments.map((a) => a.title),
      fields,
    },
    [...history, { role: "user", body: message }],
    currentFields,
  );

  const result = await runAiTask(supabase, agencyId, user.id, prompt, attachments);
  if (!result.ok || !result.text) return fail(result.error ?? "Frank didn't answer", result.status || 502);
  const reply = parseCopyChatReply(result.text, fields);

  // Saved now Claude has answered.
  if (!chatId) {
    const { data: chat, error } = await supabase
      .from("copy_chats")
      .insert({ creative_id: creative.id, mode: body.mode, created_by: user.id })
      .select("id")
      .single();
    if (error || !chat) return fail(error?.message ?? "Couldn't keep the conversation", 500);
    chatId = chat.id as string;
  } else {
    await supabase.from("copy_chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);
  }
  const { data: saved, error: saveError } = await supabase
    .from("copy_chat_messages")
    .insert([
      // Both rows carry every column: in a batch, one left out is null,
      // not its default.
      { chat_id: chatId, role: "user", body: message, drafts: [], created_by: user.id },
      { chat_id: chatId, role: "assistant", body: reply.body, drafts: reply.drafts, created_by: null },
    ])
    .select("id, role, body, drafts, created_at");
  if (saveError) return fail(`Frank answered, but the conversation couldn't be kept: ${saveError.message}`, 500);

  return NextResponse.json({ chatId, messages: saved, skippedFiles: skipped });
}
