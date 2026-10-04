import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { parseSignedRequest } from "@/lib/instagram/secrets";
import { forgetInstagramUser } from "@/lib/instagram/store";

// Meta's deauthorize callback (phase54): someone removed Frank from their
// Instagram. Signed with the app secret; their connection and token go.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const data = parseSignedRequest((form?.get("signed_request") as string | null) ?? null);
  if (!data?.user_id || !/^\d+$/.test(String(data.user_id))) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  await forgetInstagramUser(createServiceRoleClient(), String(data.user_id));
  return NextResponse.json({ ok: true });
}
