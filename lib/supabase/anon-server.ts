import { createClient } from "@supabase/supabase-js";

// A plain anon-key client for server-side code that has no user session to
// carry (the public review route) — no cookies, no auth context, just the
// same access an anonymous browser visitor would have.
export function createAnonServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
