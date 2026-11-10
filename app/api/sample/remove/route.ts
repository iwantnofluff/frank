import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { removeSampleFiles, type SampleRemoval } from "@/lib/sample/remove";

// The sample client's Remove now (phase145): Owners and Admins. The checks
// and every row are delete_sample_client, run as the signed-in person; its
// files go here. Only ever a sample: the function refuses anything else.
export async function POST(request: Request) {
  let clientId: string | undefined;
  try {
    ({ clientId } = await request.json());
  } catch {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  }
  if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_sample_client", { p_client_id: clientId });
  if (error) {
    const m = error.message;
    const status = m.includes("not permitted") ? 403 : m.includes("not found") ? 404 : m.includes("not a sample") ? 409 : 500;
    return NextResponse.json({ error: m }, { status });
  }
  const filesRemoved = await removeSampleFiles(createServiceRoleClient(), data as SampleRemoval);
  return NextResponse.json({ ok: true, filesRemoved });
}
