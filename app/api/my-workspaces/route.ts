import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { brandingAllowed } from "@/lib/plans";
import { tenantFromHost } from "@/lib/tenant";

// Every workspace the signed-in person belongs to, for the switcher in the
// profile menu (direct instruction: like Slack). On a workspace's address
// the database shows only that workspace, so this reads across them with
// the service role, for the caller's own memberships only: joined, not
// removed, and the workspace not archived. Each one's name, address and
// logo (Growth and up, as in the header), and which one this is.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const host = request.headers.get("host");
  const tenant = tenantFromHost(host);
  const admin = createServiceRoleClient();
  const { data: rows, error } = await admin
    .from("memberships")
    .select("agency:agencies(id, name, subdomain, plan, archived_at, suspended_at)")
    .eq("user_id", user.id)
    .is("removed_at", null)
    .not("accepted_at", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Agency = { id: string; name: string; subdomain: string | null; plan: string | null; archived_at: string | null; suspended_at: string | null };
  const byId = new Map<string, Agency>();
  // A Client at several of a workspace's clients has a membership for each.
  for (const r of rows ?? []) {
    const a = r.agency as unknown as Agency | null;
    if (a?.subdomain && !a.archived_at) byId.set(a.id, a);
  }
  const agencies = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));

  const branded = agencies.filter((a) => brandingAllowed(a.plan)).map((a) => a.id);
  const { data: settings } = branded.length
    ? await admin.from("agency_settings").select("agency_id, logo_asset:assets(storage_key)").in("agency_id", branded)
    : { data: [] };
  const keyOf = new Map(
    (settings ?? []).map((s) => [s.agency_id as string, (s.logo_asset as unknown as { storage_key: string } | null)?.storage_key ?? null]),
  );
  const keys = [...keyOf.values()].filter((k): k is string => !!k);
  const signed = new Map<string, string>();
  if (keys.length) {
    const { data } = await admin.storage.from("assets").createSignedUrls(keys, 3600);
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl);
  }

  return NextResponse.json({
    // Only a workspace's own address can switch; elsewhere (localhost,
    // previews) there's nowhere to switch to.
    switchable: tenant.kind === "agency",
    workspaces: agencies.map((a) => {
      const key = keyOf.get(a.id);
      return {
        id: a.id,
        name: a.name,
        url: `${new URL(request.url).protocol}//${hostFor(host, tenant, a.subdomain!)}`,
        logoUrl: key ? (signed.get(key) ?? null) : null,
        current: tenant.kind === "agency" && tenant.subdomain === a.subdomain,
        paused: !!a.suspended_at,
      };
    }),
  });
}

// Another workspace's address, from this one's: nofluff.beingfrank.app →
// casa.beingfrank.app (keeping the port locally).
function hostFor(host: string | null, tenant: ReturnType<typeof tenantFromHost>, subdomain: string) {
  if (!host) return subdomain;
  if (tenant.kind === "agency") return `${subdomain}${host.slice(tenant.subdomain.length)}`;
  return host;
}
