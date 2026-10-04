import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { exchangeCode, fetchProfile } from "@/lib/instagram/api";
import { verifyState } from "@/lib/instagram/secrets";
import { callbackUrl, saveConnection } from "@/lib/instagram/store";
import { ROOT_DOMAIN } from "@/lib/tenant";

// Where Instagram sends people back (phase54), at the environment's root
// address. The signed state says which client, who started it and where to
// return to; nothing else in the request is trusted. The account is saved
// with the service role, and they go back to their agency's address.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = verifyState(url.searchParams.get("state"));
  // A state that doesn't check out has nowhere trustworthy to return to.
  if (!state) return new NextResponse("This Instagram sign-in has expired. Start again from Frank.", { status: 400 });
  const origin = new URL(state.returnOrigin);
  const host = origin.hostname;
  const root = ROOT_DOMAIN.split(":")[0];
  if (!(host.endsWith(`.${root}`) || host.endsWith(".frank.localhost"))) {
    return new NextResponse("Unexpected return address", { status: 400 });
  }
  const back = (outcome: string, detail?: string) => {
    const to = new URL(state.returnPath, origin);
    to.searchParams.set("instagram", outcome);
    if (detail) to.searchParams.set("detail", detail.slice(0, 200));
    return NextResponse.redirect(to);
  };

  const code = url.searchParams.get("code");
  if (!code) return back("cancelled");

  const admin = createServiceRoleClient();
  try {
    if (state.linkId) {
      const { data: link } = await admin
        .from("instagram_connect_links")
        .select("used_at, expires_at, client_id")
        .eq("id", state.linkId)
        .maybeSingle();
      if (!link || link.used_at || new Date(link.expires_at as string) < new Date() || link.client_id !== state.clientId) {
        return back("link_invalid");
      }
    }

    const { token, expiresAt } = await exchangeCode(code, callbackUrl(request));
    const profile = await fetchProfile(token);
    if (profile.account_type && !["BUSINESS", "MEDIA_CREATOR"].includes(profile.account_type)) {
      return back("not_professional");
    }

    let connectedByName = "the client, through a link";
    if (state.userId) {
      const { data: who } = await admin.from("users").select("name, email").eq("id", state.userId).maybeSingle();
      connectedByName = (who?.name as string) || (who?.email as string) || "someone at the agency";
    }
    await saveConnection(admin, { clientId: state.clientId, profile, token, expiresAt, connectedByName });
    if (state.linkId) {
      await admin.from("instagram_connect_links").update({ used_at: new Date().toISOString() }).eq("id", state.linkId);
    }
    return back("connected");
  } catch (e) {
    return back("failed", (e as Error).message);
  }
}
