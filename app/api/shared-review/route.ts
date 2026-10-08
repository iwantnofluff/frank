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
  // The link's agency (paused? which plan?) and its project's client logo,
  // read once for everything below. Reported directly: the link took 5–6s
  // to load, mostly lookups waiting on one another; they now run together
  // where they can, and every address is signed in one request.
  let link: LinkRow | null = null;
  try {
    serviceRole = createServiceRoleClient();
    const { data: row } = await serviceRole
      .from("shared_links")
      .select("agency_id, agencies(suspended_at, plan), projects(clients(name, logo_asset_id))")
      .eq("token", token)
      .maybeSingle();
    link = row as unknown as LinkRow | null;
    // A paused agency's review links stop working (phase37) — on every
    // address, including ones the proxy doesn't gate (the old vercel.app).
    if (link?.agencies?.suspended_at) {
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

  const ids = creatives.map((c) => c.id);
  const commentIds = creatives.flatMap((c) => c.comments.map((m) => m.id));
  const clientLogoId = link?.projects?.clients?.logo_asset_id ?? null;
  // Logo and colours are a Growth-and-up feature (the spec's white-label
  // row; phase41): below that, review links keep Frank's own look.
  const branded = !!link && brandingAllowed(link.agencies?.plan);

  // The feed (phase67): every post of the project in grid order, by stage
  // only unless this link shares it. Checked against the token and passcode
  // again by its own function; started now so it runs alongside the rest.
  const feedPromise = anon
    .rpc("get_shared_review_feed", { p_token: token, p_passcode: passcode ?? null })
    .then(({ data: f }) => (f?.status === "ok" ? (f.feed as { id: string | null; name?: string | null; stage: number; reel: boolean }[]) : null));

  // Everything that only needs the validated token, at once.
  const [creativeRows, anchorRows, versionRows, settings, clientLogo] = serviceRole
    ? await Promise.all([
        // Every format a post goes out as (phase29) — get_shared_review
        // returns only the main one — its slide count, and when its artwork
        // was removed after going live (phase60), so the page says so.
        // Looked up for exactly the creatives that function just returned
        // for this validated token, nothing wider.
        ids.length
          ? serviceRole.from("creatives").select("id, formats, slide_count, artwork_removed_at").in("id", ids).then((r) => r.data ?? [])
          : [],
        // Each comment's anchor — get_shared_review returns only the text —
        // so a comment made at a moment in a video can show, and jump to, it.
        commentIds.length
          ? serviceRole.from("comments").select("id, anchor").in("id", commentIds).then((r) => r.data ?? [])
          : [],
        // Each creative's latest version, for its carousel slides (phase31).
        ids.length
          ? serviceRole
              .from("creative_versions")
              .select("id, creative_id, version_no, asset_id")
              .in("creative_id", ids)
              .order("version_no", { ascending: false })
              .then((r) => r.data ?? [])
          : [],
        // Per direct instruction, review links carry the agency's own colours
        // and logo. Only the theme and a signed logo URL leave the server;
        // the agency's id never does.
        branded
          ? serviceRole
              .from("agency_settings")
              .select("theme, logo_asset:assets(storage_key)")
              .eq("agency_id", link!.agency_id)
              .maybeSingle()
              .then((r) => r.data as unknown as { theme: Record<string, unknown> | null; logo_asset: { storage_key: string } | null } | null)
          : null,
        // The client's logo, beside the handle in the phone (direct
        // instruction): the link's project's client.
        clientLogoId
          ? serviceRole.from("assets").select("storage_key").eq("id", clientLogoId).maybeSingle().then((r) => r.data)
          : null,
      ])
    : [[], [], [], null, null];

  const formatsById = new Map<string, string[]>();
  const slideCountById = new Map<string, number | null>();
  const removedById = new Map<string, string | null>();
  for (const r of creativeRows) {
    formatsById.set(r.id, r.formats);
    slideCountById.set(r.id, r.slide_count);
    removedById.set(r.id, r.artwork_removed_at);
  }
  const anchorById = new Map<string, unknown>();
  for (const r of anchorRows) if (r.anchor) anchorById.set(r.id, r.anchor);

  // The latest version's slides — the same version get_shared_review's
  // `asset` comes from.
  const latest = new Map<string, string>();
  const emptied = new Set<string>();
  for (const v of versionRows) {
    if (latest.has(v.creative_id)) continue;
    latest.set(v.creative_id, v.id);
    // Saved with every slide removed (phase32). get_shared_review's `asset`
    // skips a version with no file and falls back to the one before, so
    // it's cleared here instead.
    if (!v.asset_id) emptied.add(v.creative_id);
  }
  const slideRows =
    serviceRole && latest.size
      ? (((
          await serviceRole
            .from("creative_version_slides")
            .select("creative_version_id, position, asset:assets(storage_key, mime_type, filename)")
            .in("creative_version_id", [...latest.values()])
        ).data ?? []) as unknown as {
          creative_version_id: string;
          position: number;
          asset: { storage_key: string; mime_type: string; filename: string } | null;
        }[])
      : [];

  // Every file the page shows — each post's artwork, each slide, and the two
  // logos — signed in one request rather than one at a time. Signed here
  // because a visitor has no session to read storage with.
  const keys = new Set<string>();
  for (const c of creatives) if (c.asset?.storage_key && !emptied.has(c.id)) keys.add(c.asset.storage_key);
  for (const r of slideRows) if (r.asset) keys.add(r.asset.storage_key);
  if (settings?.logo_asset) keys.add(settings.logo_asset.storage_key);
  if (clientLogo) keys.add(clientLogo.storage_key);
  const signedByKey = new Map<string, string>();
  if (serviceRole && keys.size) {
    const { data: signed } = await serviceRole.storage.from("assets").createSignedUrls([...keys], 3600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) signedByKey.set(s.path, s.signedUrl);
  }
  const signedUrl = (key: string | null | undefined) => (key ? (signedByKey.get(key) ?? null) : null);

  const creativeOf = new Map([...latest].map(([cid, vid]) => [vid, cid]));
  const slidesById = new Map<string, { position: number; signed_url: string | null; mime_type: string; filename: string }[]>();
  for (const r of slideRows) {
    if (!r.asset) continue;
    const cid = creativeOf.get(r.creative_version_id)!;
    const list = slidesById.get(cid) ?? [];
    list.push({ position: r.position, signed_url: signedUrl(r.asset.storage_key), mime_type: r.asset.mime_type, filename: r.asset.filename });
    slidesById.set(cid, list);
  }
  for (const list of slidesById.values()) list.sort((a, b) => a.position - b.position);

  const signedCreatives = creatives.map((raw) => {
    const asset = emptied.has(raw.id) ? null : raw.asset;
    return {
      ...raw,
      formats: formatsById.get(raw.id) ?? [raw.format],
      slides: slidesById.get(raw.id) ?? [],
      slide_count: slideCountById.get(raw.id) ?? null,
      artwork_removed_at: removedById.get(raw.id) ?? null,
      comments: raw.comments.map((m) => ({ ...m, anchor: anchorById.get(m.id) ?? null })),
      // A fresh asset object that never includes storage_key, rather than
      // spreading the original and overwriting it — `{ ...asset,
      // storage_key: undefined }` still leaves the key present (just
      // undefined), which only disappears because JSON.stringify drops
      // undefined values. That's an accident to rely on, not a guarantee.
      asset: asset
        ? {
            version_no: asset.version_no,
            mime_type: asset.mime_type,
            filename: asset.filename,
            signed_url: serviceRole ? signedUrl(asset.storage_key) : null,
          }
        : null,
    };
  });

  const branding = branded
    ? { theme: settings?.theme ?? null, logo_url: signedUrl(settings?.logo_asset?.storage_key) }
    : { theme: null, logo_url: null };

  const feed = await feedPromise;
  return NextResponse.json({
    ...data,
    creatives: signedCreatives,
    branding,
    client_logo_url: signedUrl(clientLogo?.storage_key),
    // Whose review this is (direct instruction: the client's name was
    // missing): the link's project's client.
    client_name: link?.projects?.clients?.name ?? null,
    feed,
  });
}

// The link's own row, as read above.
interface LinkRow {
  agency_id: string;
  agencies: { suspended_at: string | null; plan: string | null } | null;
  projects: { clients: { name: string; logo_asset_id: string | null } | null } | null;
}
