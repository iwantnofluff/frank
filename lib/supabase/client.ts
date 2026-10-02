import { createBrowserClient } from "@supabase/ssr";
import { agencyHeader, tenantFromHost } from "@/lib/tenant";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // On an agency's own address, every request says which agency, so the
    // database shows only that agency's work (phase36).
    {
      global: {
        headers: agencyHeader(tenantFromHost(typeof window === "undefined" ? null : window.location.host)),
      },
    },
  );
}
