import { NextResponse } from "next/server";
import { createAnonServerClient } from "@/lib/supabase/anon-server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

interface RpcCreative {
  id: string;
  name: string;
  format: string;
  stage: number;
  position: number;
  scheduled_at: string | null;
  destination: string | null;
  approved_at: string | null;
  asset: {
    version_no: number;
    storage_key: string;
    mime_type: string;
    filename: string;
  } | null;
  copy: { version_no: number; fields: Record<string, string> } | null;
  comments: { id: string; author_name: string; body: string; created_at: string }[];
}

// The public review page never talks to Supabase directly for its initial
// fetch — it calls this route instead. The reason is entirely about the
// asset: get_shared_review() (SECURITY DEFINER, runs in Postgres) can read
// creative_versions/assets fine, but signing a Storage URL isn't a SQL
// operation — it's the Storage API, which enforces its own RLS on
// storage.objects. A public visitor has no session at all, so nothing
// grants them read there, and nothing should: granting anon broad storage
// read would let anyone enumerate any agency's files by guessing paths.
// The service role key, used only here and only after the token (and
// passcode, if any) has already been validated by the RPC, is what signs
// the URL instead.
export async function POST(request: Request) {
  let body: { token?: string; passcode?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "not_found" }, { status: 400 });
  }

  const { token, passcode } = body;
  if (!token) {
    return NextResponse.json({ status: "not_found" }, { status: 400 });
  }

  const anon = createAnonServerClient();
  const { data, error } = await anon.rpc("get_shared_review", {
    p_token: token,
    p_passcode: passcode ?? null,
  });

  if (error) {
    return NextResponse.json({ status: "not_found" }, { status: 500 });
  }

  if (data.status !== "ok") {
    return NextResponse.json(data);
  }

  const creatives = data.creatives as RpcCreative[];
  let serviceRole: ReturnType<typeof createServiceRoleClient> | null = null;
  try {
    serviceRole = createServiceRoleClient();
  } catch {
    // Key not configured — degrade to "no preview" rather than a hard
    // failure of the whole page. Every prior phase has treated a missing
    // asset pipeline this way rather than erroring the page out.
  }

  const signedCreatives = await Promise.all(
    creatives.map(async (c) => {
      // Both branches build a fresh asset object that never includes
      // storage_key, rather than spreading the original and overwriting it
      // — `{ ...c.asset, storage_key: undefined }` still leaves the key
      // present (just undefined), which only happens to disappear because
      // JSON.stringify drops undefined values. That's an accident to rely
      // on, not a guarantee; an explicit object has no such dependency.
      if (!c.asset) {
        return { ...c, asset: null };
      }
      if (!c.asset.storage_key || !serviceRole) {
        return {
          ...c,
          asset: {
            version_no: c.asset.version_no,
            mime_type: c.asset.mime_type,
            filename: c.asset.filename,
            signed_url: null,
          },
        };
      }

      const { data: signed } = await serviceRole.storage
        .from("assets")
        .createSignedUrl(c.asset.storage_key, 3600);

      return {
        ...c,
        asset: {
          version_no: c.asset.version_no,
          mime_type: c.asset.mime_type,
          filename: c.asset.filename,
          signed_url: signed?.signedUrl ?? null,
        },
      };
    }),
  );

  return NextResponse.json({ ...data, creatives: signedCreatives });
}
