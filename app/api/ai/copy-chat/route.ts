import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAiTask } from "@/lib/ai/run-ai-task";
import {
  chatFields,
  buildCopyChatPromptParts,
  openingMessage,
  parseCopyChatReply,
  slideTextFields,
  VO_FIELD,
  type CopyChatMode,
  type CopyChatTurn,
} from "@/lib/ai/copy-chat";
import { monthOf, strategyForPrompt, type StrategyFields } from "@/lib/monthly-strategy";
import { COPY_FIELD_LABELS, copyFieldsFor, formatsLabel, hasVideoFormat, postFormats } from "@/lib/formats";
import { clientContext, loadKnowledgeFiles } from "@/lib/ai/client-context";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

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
    .select("id, agency_id, name, concept, approach_notes, format, formats, slide_count, scheduled_at, due_on, project:projects(client_id)")
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
  // The formats' copy fields, a video's VO, then the Text on Image (one
  // per slide).
  const fields = [
    ...copyFieldsFor(formats).map((key) => ({ key, label: COPY_FIELD_LABELS[key] ?? key })),
    // A video post's VO (phase88).
    ...(hasVideoFormat(formats) ? [VO_FIELD] : []),
    ...slideTextFields((creative.slide_count as number | null) ?? null),
  ];

  // The conversation: an existing one, or a new one's opening.
  let chatId = body.chatId ?? null;
  let history: CopyChatTurn[] = [];
  let message: string;
  let mode: CopyChatMode;
  if (chatId) {
    const { data: chat } = await supabase.from("copy_chats").select("id, creative_id, mode").eq("id", chatId).maybeSingle();
    if (!chat || chat.creative_id !== creative.id) return fail("Conversation not found", 404);
    mode = chat.mode as CopyChatMode;
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
    mode = body.mode;
    message = openingMessage(body.mode, currentFields, fields);
  }
  // Reviewing a draft covers only what's been written (direct
  // instruction): Frank reads, reviews and suggests the filled fields, not
  // the empty ones, for the whole conversation, as filled when each message
  // is sent. Drafting covers every field.
  const covered = chatFields(mode, fields, currentFields);
  if (mode === "review" && !covered.length) return fail("Write a first draft to review", 400);

  // The context. The client's strategy is the month the post goes live in,
  // or this month without a live date (decided directly, phase78).
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
  // The client's other posts, for their voice, and what the client has
  // asked for in the last 90 days (direct instruction).
  const { otherPosts, clientFeedback } = clientId
    ? await clientContext(supabase, clientId, creative.id as string)
    : { otherPosts: [], clientFeedback: [] };

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
  const { attachments, skipped } = await loadKnowledgeFiles(supabase, [
    ...((agencyKnowledge.data ?? []) as Row[]),
    ...((clientKnowledge.data ?? []) as Row[]),
  ]);

  // The brief, knowledge and instructions first, kept by Claude between
  // messages; then this message's part.
  const prompt = buildCopyChatPromptParts(
    {
      postName: creative.name as string,
      concept: (creative.concept as string | null) ?? null,
      approachNotes: (creative.approach_notes as string[] | null) ?? [],
      formatLabel: formatsLabel(formats),
      formatDirection: direction || null,
      agencyNotes: textNotes(agencyKnowledge.data as Row[] | null),
      clientNotes: textNotes(clientKnowledge.data as Row[] | null),
      fileTitles: attachments.map((a) => a.title),
      strategy: strategyForPrompt(strategyMonth, strategy.data as Partial<StrategyFields> | null),
      otherPosts,
      clientFeedback,
      fields: covered,
    },
    [...history, { role: "user", body: message }],
    currentFields,
  );

  const result = await runAiTask(supabase, agencyId, user.id, prompt, attachments);
  if (!result.ok || !result.text) return fail(result.error ?? "Frank didn't answer", result.status || 502);
  const reply = parseCopyChatReply(result.text, covered);

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
