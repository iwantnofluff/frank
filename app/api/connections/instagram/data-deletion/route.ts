import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { parseSignedRequest } from "@/lib/instagram/secrets";
import { forgetInstagramUser, requestOrigin } from "@/lib/instagram/store";

// Meta's data deletion callback (phase54): someone asked for the data Frank
// holds about their Instagram to be deleted. It's deleted straight away
// (the connection: username, picture, counts, and the token), and Meta is
// given a page to check and a confirmation code, as it requires.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const data = parseSignedRequest((form?.get("signed_request") as string | null) ?? null);
  if (!data?.user_id || !/^\d+$/.test(String(data.user_id))) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  await forgetInstagramUser(createServiceRoleClient(), String(data.user_id));
  const code = randomBytes(8).toString("hex");
  return NextResponse.json({
    url: `${requestOrigin(request)}/instagram-data-deletion?code=${code}`,
    confirmation_code: code,
  });
}
