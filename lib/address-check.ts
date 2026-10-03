import type { SupabaseClient } from "@supabase/supabase-js";

// Whether a new agency could have this address (phase42, sign-up): the
// format the database insists on (phase36), not another agency's now, and
// not one an agency used to have (phase41). Service role.
const FORMAT = /^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])$/;
const RESERVED = [
  "www", "app", "admin", "api", "mail", "email", "help", "support", "status",
  "blog", "docs", "login", "signup", "billing", "static", "assets", "cdn", "frank",
];

export async function addressProblem(admin: SupabaseClient, subdomain: string): Promise<string | null> {
  if (!FORMAT.test(subdomain) || RESERVED.includes(subdomain)) {
    return "Use 2–32 lower-case letters, numbers or hyphens, not starting or ending with a hyphen, and not a reserved name like www or admin.";
  }
  const [{ data: taken }, { data: used }] = await Promise.all([
    admin.from("agencies").select("id").eq("subdomain", subdomain).maybeSingle(),
    admin.from("agency_previous_subdomains").select("subdomain").eq("subdomain", subdomain).maybeSingle(),
  ]);
  if (taken || used) return "That address is taken. Try another.";
  return null;
}
