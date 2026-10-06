"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIsStaff } from "@/hooks/use-is-staff";
import { useProject } from "@/hooks/use-project";
import { useCreative } from "@/hooks/use-creative";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useAgencySettings } from "@/hooks/use-agency-settings";
import { useAvatarUrls } from "@/hooks/use-avatar-urls";
import { AccountMenu } from "./AccountMenu";
import { CalendarIcon, ClientsIcon, ProjectsIcon, SettingsIcon } from "./icons";
import { AgencyMenu } from "./AgencyMenu";
import { brandingAllowed } from "@/lib/plans";

function RailLink({
  href,
  label,
  current,
  icon: Icon,
  id,
}: {
  href: string;
  label: string;
  current: boolean;
  icon: () => React.JSX.Element;
  id?: string;
}) {
  return (
    <Link href={href} className="rbtn" aria-current={current} title={label} id={id}>
      <span className="ric">
        <Icon />
      </span>
      <span className="rlab">{label}</span>
    </Link>
  );
}

// Per direct instruction, the rail follows where you are inside a client
// rather than the prototype's syncRail() (Calendar/Analytics/Visibility
// whenever a client is open):
//   a client's projects list  — Clients, Client Settings
//   a project's table         — Clients, Projects, Client Settings
//   a post's review page      — Clients, Projects, Content Planner (or
//                               Other Content), Client Settings
// where Projects goes back to that client's list and Content Planner to
// that post's own project table. Knowledge is a page of Client Settings
// now, and Settings opens from the agency's mark at the top (AgencyMenu).
export function NavRail({
  userInitials,
  userName,
  userEmail,
}: {
  userInitials: string;
  userName: string | null;
  userEmail: string;
}) {
  const pathname = usePathname();
  const { isStaff, isPending: isStaffPending } = useIsStaff();

  const routeClientId = pathname.match(/^\/clients\/([^/]+)/)?.[1];
  const routeProjectId = pathname.match(/^\/projects\/([^/]+)/)?.[1];
  const routeCreativeId = pathname.match(/^\/creatives\/([^/]+)/)?.[1];
  // The project and review pages only carry their own id in the URL; the
  // client (and, for a post, its project) come from the same cached queries
  // those pages already load, so this adds no extra request.
  const { data: project } = useProject(routeProjectId ?? "");
  const { data: creative } = useCreative(routeCreativeId ?? "");

  const clientId = routeClientId ?? project?.client_id ?? creative?.projects?.client_id;
  const projectId = routeProjectId ?? creative?.project_id;
  const insideProject = !!routeProjectId || !!routeCreativeId;

  // Settings is a real permission boundary — the prototype hides it from
  // client mode (`navSet.display = client ? "none" : "grid"`). Gated on
  // real membership (useIsStaff), not the preview toggle, and fails closed:
  // hidden while that's still resolving.
  const showStaffOnly = isStaff && !isStaffPending;
  // The agency's logo (Settings > Branding) replaces the "F" mark.
  const { data: agency } = useMyAgency();
  const { data: settings } = useAgencySettings(agency?.agencyId);
  const { data: logoUrls } = useAvatarUrls([settings?.logo_asset_id]);
  // Growth and up (phase41); below that, the "F" whatever was saved.
  const logoUrl =
    settings?.logo_asset_id && brandingAllowed(agency?.plan) ? logoUrls?.[settings.logo_asset_id] : undefined;

  return (
    <nav className="rail" aria-label="Main">
      <AgencyMenu
        isStaff={showStaffOnly}
        agencyName={agency?.name ?? null}
        mark={
          logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
            <img src={logoUrl} alt={agency?.name ?? "Agency"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            "F"
          )
        }
        hasLogo={!!logoUrl}
      />
      <RailLink href="/dashboard" label="Clients" icon={ClientsIcon} current={pathname.startsWith("/dashboard")} />
      {insideProject && clientId && (
        <RailLink href={`/clients/${clientId}`} label="Projects" icon={ProjectsIcon} current={false} />
      )}
      {routeCreativeId && projectId && (
        <RailLink
          href={`/projects/${projectId}`}
          label={creative?.projects?.delivery === "continuous" ? "Other Content" : "Content Planner"}
          icon={CalendarIcon}
          current={false}
        />
      )}
      {clientId && (
        <RailLink
          href={`/clients/${clientId}/settings`}
          label="Client Settings"
          icon={SettingsIcon}
          current={pathname.startsWith(`/clients/${clientId}/settings`)}
          id="navClientSet"
        />
      )}
      <div className="spacer" />
      <AccountMenu initials={userInitials} name={userName} email={userEmail} />
    </nav>
  );
}
