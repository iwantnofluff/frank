import Anthropic from "@anthropic-ai/sdk";
import type { Attachment } from "../attachment";

// Claude can end a turn with stop_reason "refusal" and zero content blocks
// — its own safety classifier declining, not an error on our side.
// Reproduced directly against the real API while building this: the exact
// same prompt and attachment refused on some calls and completed normally
// on others — not a deterministic reaction to this content, closer to
// noise near the classifier's threshold. Worth one silent retry before
// bothering the user with it, unlike a real error.
const REFUSAL_RETRIES = 2;

export async function generate(
  prompt: string | string[],
  model: string,
  attachments: Attachment[] = [],
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  // An org-level (not workspace-scoped) API key needs the workspace named
  // explicitly on every request, or Anthropic rejects it outright — see
  // ANTHROPIC_WORKSPACE_ID's own comment in .env.local. A workspace-scoped
  // key doesn't need this; the header is simply omitted when unset.
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
  const client = new Anthropic({
    apiKey,
    defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined,
  });

  // Attachments (PDFs) go first, the text prompt last — Anthropic's own
  // guidance for document + instruction ordering in a single message.
  // Images as image blocks (phase52), each preceded by its title so the
  // prompt can refer to it.
  const parts = Array.isArray(prompt) ? prompt : [prompt];
  const content: Anthropic.Messages.ContentBlockParam[] = [
    ...attachments.flatMap((a): Anthropic.Messages.ContentBlockParam[] =>
      a.mediaType === "application/pdf"
        ? [{ type: "document", title: a.title, source: { type: "base64", media_type: a.mediaType, data: a.base64 } }]
        : [
            { type: "text", text: `Attached image: ${a.title}` },
            { type: "image", source: { type: "base64", media_type: a.mediaType, data: a.base64 } },
          ],
    ),
    ...parts.map((text): Anthropic.Messages.ContentBlockParam => ({ type: "text", text })),
  ];
  // Prompt caching (direct instruction: Draft with Frank was slow): the
  // files and the parts that don't change are kept by Claude for a few
  // minutes, so the next message in the conversation doesn't send them
  // through again in full. Marked on the last fixed part, and only for a
  // prompt sent in parts (a conversation): keeping costs a little more the
  // first time, so a one-off request (a check) isn't marked.
  const fixedEnd = parts.length > 1 ? content.length - 2 : -1;
  if (fixedEnd >= 0) {
    const block = content[fixedEnd] as Anthropic.Messages.ContentBlockParam & { cache_control?: { type: "ephemeral" } };
    block.cache_control = { type: "ephemeral" };
  }

  let message: Anthropic.Messages.Message | undefined;
  for (let attempt = 0; attempt <= REFUSAL_RETRIES; attempt++) {
    message = await client.messages.create({
      model,
      // Room for a conversational reply with drafts that carry every
      // field: a carousel for two formats is a caption, alt text and a
      // line per slide in each draft, which ran past 2048 and cut the
      // drafts off. Only what's written is billed.
      max_tokens: 8192,
      messages: [{ role: "user", content }],
    });
    if (message.stop_reason !== "refusal") break;
  }

  if (message!.stop_reason === "refusal") {
    throw new Error(
      "Claude declined to complete this request. Try rephrasing the copy or concept, or run the check again.",
    );
  }

  const block = message!.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("Claude returned no text");
  }
  return block.text;
}
