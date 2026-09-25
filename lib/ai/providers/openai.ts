import OpenAI from "openai";
import type { Attachment } from "../attachment";

// Attachments are accepted for signature parity with the Anthropic
// provider but not sent — this provider doesn't have native-PDF support
// wired up yet. A knowledge PDF simply contributes nothing here, same as
// every other provider before this feature existed.
export async function generate(
  prompt: string,
  model: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _attachments: Attachment[] = [],
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
  });

  const text = completion.choices[0]?.message?.content;
  if (!text) {
    throw new Error("ChatGPT returned no text");
  }
  return text;
}
