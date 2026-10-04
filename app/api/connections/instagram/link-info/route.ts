import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// What a client's connect link is for (phase54): the client's and agency's
// names, and whether it can still be used. Public; the link's own token is
// the key, and nothing else is shown.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const admin = createServiceRoleClient();
  const { data: link } = await admin
    .from("instagram_connect_links")
    .select("expires_at, used_at, client:clients(name), agency:agencies(name)")
    .eq("token_hash", createHash("sha256").update(token).digest("hex"))
    .maybeSingle();
  if (!link) return NextResponse.json({ status: "not_found" });
  const l = link as unknown as {
    expires_at: string;
    used_at: string | null;
    client: { name: string } | null;
    agency: { name: string } | null;
  };
  return NextResponse.json({
    status: l.used_at ? "used" : new Date(l.expires_at) < new Date() ? "expired" : "ok",
    clientName: l.client?.name ?? null,
    agencyName: l.agency?.name ?? null,
  });
}
