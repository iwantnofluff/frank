import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Deleting an archived client or project for good (phase74, direct
// instruction; Owners and the Primary Owner only). The checks and every
// database change are delete_client_permanently / delete_project_permanently,
// run as the signed-in person; they return the files they freed and the
// posts they removed. Those files, each post's own folder (anything uploaded
// but never saved too), and a client's logo folder are removed here with the
// service role, since no signed-in role can delete storage. Nothing about
// which files to remove comes from the browser.
export async function POST(request: Request) {
  let kind: string | undefined;
  let id: string | undefined;
  try {
    ({ kind, id } = await request.json());
  } catch {
    return NextResponse.json({ error: "kind and id are required" }, { status: 400 });
  }
  if ((kind !== "client" && kind !== "project") || !id) {
    return NextResponse.json({ error: "kind and id are required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(kind === "client" ? "delete_client_permanently" : "delete_project_permanently", {
    [kind === "client" ? "p_client_id" : "p_project_id"]: id,
  });
  if (error) {
    const m = error.message;
    const status = m.includes("not permitted") ? 403 : m.includes("not found") ? 404 : m.includes("archive it first") ? 409 : 500;
    return NextResponse.json({ error: m.includes("archive it first") ? "Archive it first." : m }, { status });
  }

  const result = data as { agency_id: string; client_id?: string; creative_ids: string[]; keys: string[] };
  const storage = createServiceRoleClient().storage.from("assets");
  const paths = new Set(result.keys);
  const folders = result.creative_ids.map((c) => `${result.agency_id}/${c}`);
  if (result.client_id) folders.push(`${result.agency_id}/client-logos/${result.client_id}`);
  let filesRemoved = 0;
  try {
    for (const folder of folders) {
      const { data: files } = await storage.list(folder, { limit: 1000 });
      for (const f of files ?? []) if (f.id) paths.add(`${folder}/${f.name}`);
    }
    for (let i = 0; i < paths.size; i += 500) {
      const { data: gone } = await storage.remove([...paths].slice(i, i + 500));
      filesRemoved += gone?.length ?? 0;
    }
  } catch {
    // The rows are already gone; a file left behind is the known storage
    // sweep gap, not a reason to say the delete failed.
  }
  return NextResponse.json({ ok: true, filesRemoved });
}
