import { modelById } from "./models";
import type { Attachment } from "./attachment";

// Dynamic imports so a provider whose SDK throws on module load (an
// unlikely but not impossible way for a missing/malformed env var to
// surface) can't take the other two providers down with it.
export async function generateDraft(
  model: string,
  // Parts: Claude keeps all but the last between messages; the others
  // join them (their own caching needs nothing marked).
  prompt: string | string[],
  attachments: Attachment[] = [],
): Promise<string> {
  const joined = Array.isArray(prompt) ? prompt.join("\n\n") : prompt;
  const option = modelById(model);
  if (!option) {
    throw new Error(`Unknown model "${model}"`);
  }

  switch (option.provider) {
    case "anthropic":
      return (await import("./providers/anthropic")).generate(prompt, model, attachments);
    case "openai":
      return (await import("./providers/openai")).generate(joined, model, attachments);
    case "google":
      return (await import("./providers/google")).generate(joined, model, attachments);
  }
}
