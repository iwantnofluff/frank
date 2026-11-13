import { frontDoorFor, tenantFromHost } from "@/lib/tenant";
import { requestOrigin } from "@/lib/instagram/store";

// Slack sends people back to one address per environment, its front door
// (as Instagram's sign-in does, lib/instagram/store.ts), whichever
// workspace asked; listed as Redirect URLs on Frank's Slack app.
export function slackCallbackUrl(request: Request): string {
  const origin = new URL(requestOrigin(request));
  const kind = tenantFromHost(origin.host).kind;
  const host = kind === "agency" || kind === "root" ? (frontDoorFor(origin.host) ?? origin.host) : origin.host;
  return `${origin.protocol}//${host}/api/connections/slack/callback`;
}
