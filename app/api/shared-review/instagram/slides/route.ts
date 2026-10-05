import { NextResponse } from "next/server";
import { createAnonServerClient } from "@/lib/supabase/anon-server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { liveSlides } from "@/lib/instagram/store";

// A live carousel's slides on a review link (phase54): the link (and
// passcode) checked by the same RPC as the page, then the client's
// Instagram asked with the service role.
export async function POST(request: Request) {
  let body: { token?: string; passcode?: string | null; media?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "not_connected" }, { status: 400 });
  }
  if (!body.token || !/^\d{1,40}$/.test(body.media ?? "")) return NextResponse.json({ status: "not_connected" }, { status: 400 });
  const { data } = await createAnonServerClient().rpc("get_shared_review", {
    p_token: body.token,
    p_passcode: body.passcode ?? null,
  });
  if ((data as { status?: string } | null)?.status !== "ok") return NextResponse.json({ status: "not_connected" });
  const admin = createServiceRoleClient();
  const { data: link } = await admin.from("shared_links").select("project:projects(client_id)").eq("token", body.token).maybeSingle();
  const clientId = (link as unknown as { project: { client_id: string } | null } | null)?.project?.client_id;
  if (!clientId) return NextResponse.json({ status: "not_connected" });
  const result = await liveSlides(admin, clientId, body.media!);
  return NextResponse.json(result.status === "ok" ? result : { status: "not_connected" });
}
