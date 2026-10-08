import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// The daily artwork run (phase60), called by Vercel's cron (vercel.json)
// with CRON_SECRET as its bearer token. Removes the artwork of Approved
// posts live longer than their client keeps artwork (7 days unless its Preferences say otherwise, phase70), notifies Owners and Admins about
// undated ones, then deletes the freed files from storage.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  // Never open: without a secret set, nothing can run it.
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const { data: keys, error } = await admin.rpc("run_artwork_housekeeping");
  if (error) {
    console.error("Artwork housekeeping failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const paths = (keys ?? []) as string[];
  let filesRemoved = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const { data, error: removeError } = await admin.storage.from("assets").remove(paths.slice(i, i + 100));
    // The rows are gone already; a file left behind is the known
    // storage-sweep gap, so it's logged rather than failing the run.
    if (removeError) console.error("Artwork file removal failed", removeError);
    filesRemoved += data?.length ?? 0;
  }
  return NextResponse.json({ ok: true, files: paths.length, filesRemoved });
}
