// Which part of Frank an address is (phase36). Decided directly: each
// agency at agencyname.beingfrank.app, the bare domain a holding page, and
// admin.beingfrank.app kept for the platform admin area.
//
// Locally the same shapes work under frank.localhost (Chrome sends any
// *.localhost to this machine): frank.localhost:3000 is the holding page,
// nofluff.frank.localhost:3000 is No Fluff. Anything else — plain
// localhost (what the tests use), the old frank-gamma-one.vercel.app,
// Vercel previews — is "legacy": the app as before, with no agency
// narrowing.

export type Tenant =
  | { kind: "root" }
  | { kind: "admin" }
  | { kind: "agency"; subdomain: string }
  | { kind: "legacy" };

// The domain agencies live under: beingfrank.app live, and
// staging.beingfrank.app on the hosted staging copy (NEXT_PUBLIC_ROOT_DOMAIN).
export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "beingfrank.app";

const ROOT_DOMAINS = [ROOT_DOMAIN, "frank.localhost"];

export function tenantFromHost(host: string | null | undefined): Tenant {
  const hostname = (host ?? "").split(":")[0].toLowerCase();
  for (const root of ROOT_DOMAINS) {
    if (hostname === root || hostname === `www.${root}`) return { kind: "root" };
    if (hostname.endsWith(`.${root}`)) {
      const sub = hostname.slice(0, -(root.length + 1));
      // One level only (*.beingfrank.app); deeper names aren't agencies.
      if (sub.includes(".")) return { kind: "legacy" };
      if (sub === "admin") return { kind: "admin" };
      return { kind: "agency", subdomain: sub };
    }
  }
  return { kind: "legacy" };
}

// The header the database narrows on (in_request_agency, phase36): only
// sent on an agency's own address.
export function agencyHeader(tenant: Tenant): Record<string, string> {
  return tenant.kind === "agency" ? { "x-frank-agency": tenant.subdomain } : {};
}

// The same address with another agency's name in front: where an old
// address redirects to (phase41), and where an Owner lands after changing
// it. Keeps the root domain and port as they were.
export function hostWithSubdomain(host: string, from: string, to: string): string {
  return host.toLowerCase().startsWith(`${from.toLowerCase()}.`) ? `${to}${host.slice(from.length)}` : host;
}

// One sign-in for every workspace (decided directly, like Slack): on a
// workspace's address the session cookie belongs to the root domain, so
// nofluff.beingfrank.app and casa.beingfrank.app share it, and switching
// workspace doesn't ask you to sign in again. Each workspace still checks
// you belong to it (the middleware). The cookie is named for the database
// project, so live's (.beingfrank.app) and staging's
// (.staging.beingfrank.app, which sits under it) never meet. A new name
// also means the old per-address cookies are simply ignored: everyone signs
// in once more. Elsewhere (localhost, previews) it stays the address's own.
export function sessionCookieOptions(host: string | null | undefined): {
  name: string;
  domain?: string;
  secure?: boolean;
} {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
  const name = `sb-${ref}-session`;
  const hostname = (host ?? "").split(":")[0].toLowerCase();
  // The platform admin area keeps a sign-in of its own, never shared with
  // the workspaces (and named apart, so the two never meet there).
  if (tenantFromHost(hostname).kind === "admin") return { name: `${name}-admin` };
  const root = ROOT_DOMAINS.find((r) => hostname === r || hostname.endsWith(`.${r}`));
  if (!root) return { name };
  return { name, domain: root, secure: root !== "frank.localhost" };
}
