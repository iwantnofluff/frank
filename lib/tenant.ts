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
