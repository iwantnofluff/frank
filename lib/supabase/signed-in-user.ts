import type { SupabaseClient } from "@supabase/supabase-js";

// Who's signed in, in the browser, from the session it already holds:
// no round trip to the auth server, as auth.getUser() makes (it refreshes
// the session first only if it has expired). Only for knowing whose id to
// write or read — the database checks the session itself on every request,
// and the server (proxy.ts, the app layout, API routes) still verifies it
// with getUser. Same shape as getUser's answer, so callers read it alike.
export async function signedInUser(supabase: SupabaseClient) {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  return { data: { user: session?.user ?? null }, error };
}
