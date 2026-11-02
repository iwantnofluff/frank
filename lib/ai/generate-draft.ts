import { modelById } from "./models";
import type { Attachment } from "./attachment";

// Tokens a request used (phase128), so what an agency costs is known.
// Input excludes what was read back from the provider's cache, which is
// billed at a fraction of the price.
export interface AiUsage {
  input: number;
  cacheRead: number;
  output: number;
}

export interface AiGeneration {
  text: string;
  usage?: AiUsage;
}

// Dynamic imports so a provider whose SDK throws on module load (an
// unlikely but not impossible way for a missing/malformed env var to
// surface) can't take the other two providers down with it.
export async function generateDraft(
  model: string,
  // Parts: Claude keeps all but the last between messages; the others
  // join them (their own caching needs nothing marked).
  prompt: string | string[],
  attachments: Attachment[] = [],
  // The answer as it's written, where the provider can stream it (Claude);
  // otherwise all of it at once at the end.
  onText?: (text: string) => void,
): Promise<AiGeneration> {
  const joined = Array.isArray(prompt) ? prompt.join("\n\n") : prompt;
  const option = modelById(model);
  if (!option) {
    throw new Error(`Unknown model "${model}"`);
  }

  switch (option.provider) {
    case "anthropic":
      return (await import("./providers/anthropic")).generate(prompt, model, attachments, onText);
    case "openai": {
      const result = await (await import("./providers/openai")).generate(joined, model, attachments);
      onText?.(result.text);
      return result;
    }
    case "google": {
      const result = await (await import("./providers/google")).generate(joined, model, attachments);
      onText?.(result.text);
      return result;
    }
  }
}
