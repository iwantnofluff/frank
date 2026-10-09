// Every mutation/query error-message fallback in this app checked
// `error instanceof Error` before reading `.message`, on the assumption
// that's what Supabase throws. Verified empirically (not assumed) against
// this project's own Supabase instance, from the browser client
// (@supabase/supabase-js) specifically, not just postgrest-js's typings:
// a 42501 RLS denial and a PGRST205 schema-cache miss both come back as a
// plain object (`error.constructor.name === "Object"`), not an Error
// instance — even though postgrest-js's own PostgrestError class declares
// `extends Error`. `instanceof Error` was false for both, meaning every one
// of these checks silently discarded the real backend message and fell
// back to a generic string, in every save-error path across the app.
// Checking by shape (does it have a string `message`?) instead of by
// class fixes all of them at once.
export function errorMessage(error: unknown, fallback: string): string {
  let message: string | null = null;
  if (error instanceof Error) message = error.message;
  else if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    message = (error as { message: string }).message;
  }
  return message ? friendlyLimit(message) : fallback;
}

// The database's own limit refusals (phase37), in words a person can act on.
function friendlyLimit(message: string): string {
  const clients = message.match(/client limit reached \((\d+)\)/);
  if (clients) {
    return `This workspace's plan allows ${clients[1]} active clients. Archive one, or move to a bigger plan in Settings → Your Plan.`;
  }
  const members = message.match(/member limit reached \((\d+)\)/);
  if (members) {
    return `This workspace's plan allows ${members[1]} team members, counting invites not yet accepted. Remove someone, or move to a bigger plan in Settings → Your Plan.`;
  }
  // Free's trial over (phase41): nothing changes until a paid plan.
  if (message.includes("agency is read-only")) {
    return "Your workspace's free trial has ended, so Frank is read-only. Choose a plan in Settings → Your Plan to carry on.";
  }
  const storage = message.match(/storage limit reached \((\d+)\)/);
  if (storage) {
    return `This workspace's plan includes ${formatGb(Number(storage[1]))} of storage, and it's full. Delete files you no longer need, or move to a bigger plan.`;
  }
  // Storage reports a database refusal without its words; the upload
  // check (lib/upload-guard.ts) normally says why before it gets here.
  if (message.includes("database error, code: P0001")) {
    return "The upload was refused: your workspace's storage is full, or its free trial has ended.";
  }
  return message;
}

function formatGb(bytes: number) {
  return bytes >= 1024 ** 3 ? `${+(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
}
