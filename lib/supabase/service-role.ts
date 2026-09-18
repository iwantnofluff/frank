import { createClient } from "@supabase/supabase-js";

// Server-only. Never import this from a "use client" file — the service
// role key bypasses RLS entirely. It exists for exactly one reason: a
// public review visitor has no Supabase session, so nothing else can sign
// a storage URL on their behalf. Every use of this client must be in a
// route that has already independently validated the visitor's token
// (and passcode, if the link has one) before touching storage.
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured — add it to .env.local (Supabase dashboard: Project Settings > API > service_role key).",
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
