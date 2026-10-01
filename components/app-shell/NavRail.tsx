"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIsStaff } from "@/hooks/use-is-staff";
import { useProject } from "@/hooks/use-project";
import { useCreative } from "@/hooks/use-creative";
import { AccountMenu } from "./AccountMenu";
import { CalendarIcon, ClientsIcon, KnowledgeIcon, ProjectsIcon, SettingsIcon } from "./icons";

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
//   a client's projects list  — Clients, Knowledge, Settings
//   a project's table         — Clients, Projects, Knowledge, Settings
//   a post's review page      — Clients, Projects, Calendar, Knowledge, Settings
// where Projects goes back to that client's list and Calendar to that
// post's own project table.
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

  return (
    <nav className="rail" aria-label="Main">
      <div className="mark">F</div>
      <RailLink href="/dashboard" label="Clients" icon={ClientsIcon} current={pathname.startsWith("/dashboard")} />
      {insideProject && clientId && (
        <RailLink href={`/clients/${clientId}`} label="Projects" icon={ProjectsIcon} current={false} />
      )}
      {routeCreativeId && projectId && (
        <RailLink href={`/projects/${projectId}`} label="Calendar" icon={CalendarIcon} current={false} />
      )}
      {clientId && (
        <RailLink
          href={`/clients/${clientId}/knowledge`}
          label="Knowledge"
          icon={KnowledgeIcon}
          current={pathname.startsWith(`/clients/${clientId}/knowledge`)}
        />
      )}
      {showStaffOnly && (
        <RailLink
          href="/settings"
          label="Settings"
          icon={SettingsIcon}
          current={pathname.startsWith("/settings")}
          id="navSet"
        />
      )}
      <div className="spacer" />
      <AccountMenu initials={userInitials} name={userName} email={userEmail} />
    </nav>
  );
}
