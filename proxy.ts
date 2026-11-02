import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static assets and Next internals. Deliberately
    // broad — new internal routes are protected by default rather than
    // needing to be added to an allowlist one at a time. api/version is the
    // one exception by name: it says only which release is deployed, and
    // every open tab asks every five minutes, so it skips the gate.
    "/((?!_next/static|_next/image|favicon.ico|api/version$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
