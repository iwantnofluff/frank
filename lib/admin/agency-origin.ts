import { tenantFromHost } from "@/lib/tenant";

// An agency's own address, worked out from the request's address:
// admin.beingfrank.app or beingfrank.app (sign-up) → nofluff.beingfrank.app,
// and locally admin.frank.localhost:3000 or frank.localhost:3000 →
// nofluff.frank.localhost:3000.
export function agencyOrigin(request: Request, subdomain: string): string {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  const tenant = tenantFromHost(host);
  const agencyHost =
    tenant.kind === "admin"
      ? `${subdomain}.${host.slice("admin.".length)}`
      : tenant.kind === "root"
        ? `${subdomain}.${host.replace(/^www\./, "")}`
        : host;
  return `${url.protocol}//${agencyHost}`;
}
