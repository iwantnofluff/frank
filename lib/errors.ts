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
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return fallback;
}
