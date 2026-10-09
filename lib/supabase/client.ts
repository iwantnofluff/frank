import { createBrowserClient } from "@supabase/ssr";
import { agencyHeader, sessionCookieOptions, tenantFromHost } from "@/lib/tenant";

export function createClient() {
  const host = typeof window === "undefined" ? null : window.location.host;
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // On an agency's own address, every request says which agency, so the
    // database shows only that agency's work (phase36).
    {
      global: {
        headers: agencyHeader(tenantFromHost(host)),
      },
      // One sign-in across every workspace's address.
      cookieOptions: sessionCookieOptions(host),
    },
  );
}
