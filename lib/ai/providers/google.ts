import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Attachment } from "../attachment";
import type { AiGeneration } from "../generate-draft";

// See providers/openai.ts's own comment — same reasoning, no native-PDF
// wiring for this provider yet.
export async function generate(
  prompt: string,
  model: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _attachments: Attachment[] = [],
): Promise<AiGeneration> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not configured");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const genModel = genAI.getGenerativeModel({ model });
  const result = await genModel.generateContent(prompt);
  const meta = result.response.usageMetadata;
  const cached = meta?.cachedContentTokenCount ?? 0;
  return {
    text: result.response.text(),
    usage: meta && { input: meta.promptTokenCount - cached, cacheRead: cached, output: meta.candidatesTokenCount },
  };
}
