import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createAnonServerClient } from "@/lib/supabase/anon-server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { brandingAllowed } from "@/lib/plans";

interface RpcCreative {
  id: string;
  name: string;
  format: string;
  formats?: string[];
  stage: number;
  exception: "changes_requested" | "rejected" | null;
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
  // pulse: just a fingerprint of what a visitor would see change (comments,
  // stages, versions), for the page to check every few seconds (direct
  // instruction: comments made elsewhere appear without a refresh). Nothing
  // is signed for it, so checking costs little.
  let body: { token?: string; passcode?: string | null; pulse?: boolean };
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
    // A paused agency's review links stop working (phase37) — on every
    // address, including ones the proxy doesn't gate (the old vercel.app).
    const { data: link } = await serviceRole
      .from("shared_links")
      .select("agencies(suspended_at)")
      .eq("token", token)
      .maybeSingle();
    if ((link?.agencies as unknown as { suspended_at: string | null } | null)?.suspended_at) {
      return NextResponse.json({ status: "not_found" });
    }
  } catch {
    // Key not configured — degrade to "no preview" rather than a hard
    // failure of the whole page. Every prior phase has treated a missing
    // asset pipeline this way rather than erroring the page out.
  }

  if (body.pulse) {
    const fingerprint = createHash("sha1")
      .update(
        JSON.stringify(
          creatives.map((c) => [c.id, c.stage, c.exception, c.asset?.version_no ?? null, c.copy?.version_no ?? null, c.comments]),
        ),
      )
      .digest("hex");
    return NextResponse.json({ status: "ok", pulse: fingerprint });
  }

  // Every format a post goes out as (phase29) — get_shared_review returns
  // only the main one. Looked up for exactly the creatives that function
  // just returned for this validated token, nothing wider.
  const formatsById = new Map<string, string[]>();
  const slideCountById = new Map<string, number | null>();
  // When artwork was removed after going live (phase60), so the page says so.
  const removedById = new Map<string, string | null>();
  if (serviceRole && creatives.length) {
    const { data: rows } = await serviceRole
      .from("creatives")
      .select("id, formats, slide_count, artwork_removed_at")
      .in("id", creatives.map((c) => c.id));
    for (const r of rows ?? []) {
      formatsById.set(r.id, r.formats);
      slideCountById.set(r.id, r.slide_count);
      removedById.set(r.id, r.artwork_removed_at);
    }
  }

  // Each comment's anchor — get_shared_review returns only the text — so
  // a comment made at a moment in a video can show, and jump to, it.
  const anchorById = new Map<string, unknown>();
  const commentIds = creatives.flatMap((c) => c.comments.map((m) => m.id));
  if (serviceRole && commentIds.length) {
    const { data: rows } = await serviceRole.from("comments").select("id, anchor").in("id", commentIds);
    for (const r of rows ?? []) if (r.anchor) anchorById.set(r.id, r.anchor);
  }

  // A carousel's slides (phase31), from each creative's latest version —
  // the same version get_shared_review's `asset` comes from. Signed here
  // for the same reason the asset is: a visitor has no session.
  const slidesById = new Map<string, { position: number; signed_url: string | null; mime_type: string; filename: string }[]>();
  const emptied = new Set<string>();
  if (serviceRole && creatives.length) {
    const { data: versions } = await serviceRole
      .from("creative_versions")
      .select("id, creative_id, version_no, asset_id")
      .in("creative_id", creatives.map((c) => c.id))
      .order("version_no", { ascending: false });
    const latest = new Map<string, string>();
    for (const v of versions ?? []) {
      if (latest.has(v.creative_id)) continue;
      latest.set(v.creative_id, v.id);
      // Saved with every slide removed (phase32). get_shared_review's
      // `asset` skips a version with no file and falls back to the one
      // before, so it's cleared here instead.
      if (!v.asset_id) emptied.add(v.creative_id);
    }
    const { data: rows } = latest.size
      ? await serviceRole
          .from("creative_version_slides")
          .select("creative_version_id, position, asset:assets(storage_key, mime_type, filename)")
          .in("creative_version_id", [...latest.values()])
      : { data: [] };
    const creativeOf = new Map([...latest].map(([cid, vid]) => [vid, cid]));
    for (const r of (rows ?? []) as unknown as {
      creative_version_id: string;
      position: number;
      asset: { storage_key: string; mime_type: string; filename: string } | null;
    }[]) {
      if (!r.asset) continue;
      const { data: signed } = await serviceRole.storage.from("assets").createSignedUrl(r.asset.storage_key, 3600);
      const cid = creativeOf.get(r.creative_version_id)!;
      const list = slidesById.get(cid) ?? [];
      list.push({ position: r.position, signed_url: signed?.signedUrl ?? null, mime_type: r.asset.mime_type, filename: r.asset.filename });
      slidesById.set(cid, list);
    }
    for (const list of slidesById.values()) list.sort((a, b) => a.position - b.position);
  }

  const signedCreatives = await Promise.all(
    creatives.map(async (raw) => {
      const c = {
        ...raw,
        asset: emptied.has(raw.id) ? null : raw.asset,
        formats: formatsById.get(raw.id) ?? [raw.format],
        slides: slidesById.get(raw.id) ?? [],
        slide_count: slideCountById.get(raw.id) ?? null,
        artwork_removed_at: removedById.get(raw.id) ?? null,
        comments: raw.comments.map((m) => ({ ...m, anchor: anchorById.get(m.id) ?? null })),
      };
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

  // Per direct instruction, review links carry the agency's own colours and
  // logo. Looked up only now — after get_shared_review has validated the
  // token (and passcode) — and only the theme and a signed logo URL leave
  // the server; the agency's id never does.
  let branding: { theme: Record<string, unknown> | null; logo_url: string | null } = {
    theme: null,
    logo_url: null,
  };
  if (serviceRole) {
    const { data: link } = await serviceRole
      .from("shared_links")
      .select("agency_id")
      .eq("token", token)
      .maybeSingle();
    // Logo and colours are a Growth-and-up feature (the spec's white-label
    // row; phase41): below that, review links keep Frank's own look.
    const { data: owner } = link
      ? await serviceRole.from("agencies").select("plan").eq("id", link.agency_id).maybeSingle()
      : { data: null };
    if (link && brandingAllowed(owner?.plan)) {
      const { data: settings } = await serviceRole
        .from("agency_settings")
        .select("theme, logo_asset_id")
        .eq("agency_id", link.agency_id)
        .maybeSingle();
      let logoUrl: string | null = null;
      if (settings?.logo_asset_id) {
        const { data: logo } = await serviceRole
          .from("assets")
          .select("storage_key")
          .eq("id", settings.logo_asset_id)
          .maybeSingle();
        if (logo) {
          const { data: signed } = await serviceRole.storage
            .from("assets")
            .createSignedUrl(logo.storage_key, 3600);
          logoUrl = signed?.signedUrl ?? null;
        }
      }
      branding = { theme: (settings?.theme as Record<string, unknown>) ?? null, logo_url: logoUrl };
    }
  }

  // The client's logo, beside the handle in the phone (direct instruction):
  // the link's project's client, looked up for this validated token only.
  let clientLogoUrl: string | null = null;
  if (serviceRole) {
    const { data: link } = await serviceRole
      .from("shared_links")
      .select("projects(clients(logo_asset_id))")
      .eq("token", token)
      .maybeSingle();
    const logoId = (link?.projects as unknown as { clients: { logo_asset_id: string | null } | null } | null)?.clients
      ?.logo_asset_id;
    if (logoId) {
      const { data: logo } = await serviceRole.from("assets").select("storage_key").eq("id", logoId).maybeSingle();
      if (logo) {
        const { data: signed } = await serviceRole.storage.from("assets").createSignedUrl(logo.storage_key, 3600);
        clientLogoUrl = signed?.signedUrl ?? null;
      }
    }
  }

  return NextResponse.json({ ...data, creatives: signedCreatives, branding, client_logo_url: clientLogoUrl });
}
