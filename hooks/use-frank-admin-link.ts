"use client";

import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { FRANK_HOME_SUBDOMAIN } from "@/lib/settings-nav";
import { ROOT_DOMAIN } from "@/lib/tenant";

// Frank Admin's sign-in, for the Primary Owner of Frank's own team's
// workspace (No Fluff), or null for everyone else (decided directly,
// 2 Nov 2026). Shown under Workspace Settings in the account menu. The
// admin area keeps its own sign-in (phase37), so this opens that:
// admin.beingfrank.app on live, admin.frank.localhost locally.
export function useFrankAdminLink(): string | null {
  const { data: agency } = useMyAgency();
  const { data: membership } = useMyMembership(agency?.agencyId);
  if (agency?.subdomain !== FRANK_HOME_SUBDOMAIN || membership?.role !== "primary_owner") return null;
  if (typeof window === "undefined") return null;
  const { protocol, hostname, port } = window.location;
  const local = hostname === "localhost" || hostname === "frank.localhost" || hostname.endsWith(".frank.localhost");
  return `${protocol}//admin.${local ? "frank.localhost" : ROOT_DOMAIN}${port ? `:${port}` : ""}/login`;
}
