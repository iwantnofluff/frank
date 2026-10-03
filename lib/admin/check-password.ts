import { createClient } from "@supabase/supabase-js";

// Is this the account's current password? Asked before changing the
// password or the sign-in email. Signs in on a throwaway client (nothing
// is stored, and the browser's own session is untouched), then signs that
// one session out again.
export async function passwordIsRight(email: string, password: string): Promise<boolean> {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) return false;
  await c.auth.signOut({ scope: "local" });
  return true;
}
