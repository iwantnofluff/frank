import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { agencyHeader, tenantFromHost } from "@/lib/tenant";

// For use in Server Components, Server Actions and Route Handlers only.
// Server Components can't write cookies, so setAll is a no-op there — the
// middleware is what actually refreshes the session cookie on each request.
export async function createClient() {
  const cookieStore = await cookies();
  // Narrowed to the agency whose address this request came to (phase36),
  // the same as the browser client.
  const host = (await headers()).get("host");

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: agencyHeader(tenantFromHost(host)) },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — safe to ignore because the
            // middleware already refreshes the session on every request.
          }
        },
      },
    },
  );
}
