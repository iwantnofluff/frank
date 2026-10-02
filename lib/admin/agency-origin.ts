// An agency's own address, worked out from the admin request's address:
// admin.beingfrank.app → nofluff.beingfrank.app, and locally
// admin.frank.localhost:3000 → nofluff.frank.localhost:3000.
export function agencyOrigin(request: Request, subdomain: string): string {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  const agencyHost = host.startsWith("admin.") ? `${subdomain}.${host.slice("admin.".length)}` : host;
  return `${url.protocol}//${agencyHost}`;
}
