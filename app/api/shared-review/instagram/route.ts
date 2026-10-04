import { NextResponse } from "next/server";
import { createAnonServerClient } from "@/lib/supabase/anon-server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { liveFeed } from "@/lib/instagram/store";

// The live Instagram feed of a review link's client (phase54), so the
// client sees the shared posts among their real ones. Loaded after the
// review page, so it never holds it up. The link (and passcode) are checked
// by the same RPC the page uses; only then is the client looked up and its
// feed read with the service role. Nothing about the account but its
// public profile and posts is returned.
export async function POST(request: Request) {
  let body: { token?: string; passcode?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "not_connected" }, { status: 400 });
  }
  if (!body.token) return NextResponse.json({ status: "not_connected" }, { status: 400 });

  const { data } = await createAnonServerClient().rpc("get_shared_review", {
    p_token: body.token,
    p_passcode: body.passcode ?? null,
  });
  if ((data as { status?: string } | null)?.status !== "ok") return NextResponse.json({ status: "not_connected" });

  const admin = createServiceRoleClient();
  const { data: link } = await admin
    .from("shared_links")
    .select("project:projects(client_id)")
    .eq("token", body.token)
    .maybeSingle();
  const clientId = (link as unknown as { project: { client_id: string } | null } | null)?.project?.client_id;
  if (!clientId) return NextResponse.json({ status: "not_connected" });
  const result = await liveFeed(admin, clientId);
  // A guest only ever sees a working feed, or none.
  return NextResponse.json(result.status === "ok" ? result : { status: "not_connected" });
}
