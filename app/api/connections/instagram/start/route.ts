import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { authorizeUrl, instagramConfigured } from "@/lib/instagram/api";
import { signState } from "@/lib/instagram/secrets";
import { callbackUrl, requestOrigin } from "@/lib/instagram/store";

const SETTINGS = "/settings/connections/instagram";

// Sends someone to Instagram's sign-in to connect a client's account
// (phase54): an Owner or Admin (?clientId=, signed in), or the client
// through the link the agency sent (?link=, no session). Who and where to
// come back to travel in a signed state, checked again on the way back.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = requestOrigin(request);
  const back = (path: string, outcome: string) =>
    NextResponse.redirect(new URL(`${path}${path.includes("?") ? "&" : "?"}instagram=${outcome}`, origin));
  if (!instagramConfigured()) return back(SETTINGS, "not_configured");

  const clientIdParam = url.searchParams.get("clientId");
  const linkToken = url.searchParams.get("link");
  let clientId: string;
  let userId: string | undefined;
  let linkId: string | undefined;
  let returnPath = SETTINGS;

  if (linkToken) {
    const admin = createServiceRoleClient();
    const { data: link } = await admin
      .from("instagram_connect_links")
      .select("id, client_id, expires_at, used_at")
      .eq("token_hash", createHash("sha256").update(linkToken).digest("hex"))
      .maybeSingle();
    returnPath = `/connect/instagram/${encodeURIComponent(linkToken)}`;
    if (!link || link.used_at || new Date(link.expires_at as string) < new Date()) return back(returnPath, "link_invalid");
    clientId = link.client_id as string;
    linkId = link.id as string;
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(new URL("/login", origin));
    const { data: client } = await supabase.from("clients").select("id, agency_id").eq("id", clientIdParam ?? "").maybeSingle();
    if (!client) return back(SETTINGS, "not_allowed");
    const { data: isAdmin } = await supabase.rpc("is_agency_admin", { check_agency_id: client.agency_id });
    if (!isAdmin) return back(SETTINGS, "not_allowed");
    clientId = client.id as string;
    userId = user.id;
    const asked = url.searchParams.get("return");
    if (asked && asked.startsWith("/") && !asked.startsWith("//")) returnPath = asked;
  }

  const state = signState({
    clientId,
    userId,
    linkId,
    returnOrigin: origin,
    returnPath,
    expiresAt: Date.now() + 15 * 60_000,
  });
  return NextResponse.redirect(authorizeUrl(callbackUrl(request), state));
}
