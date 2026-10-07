"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProject } from "@/hooks/use-project";
import { useCreative } from "@/hooks/use-creative";
import { useClientDetail } from "@/hooks/use-client";
import { CalendarIcon, ClientsIcon, ProjectsIcon, SettingsIcon } from "./icons";

function RailLink({
  href,
  label,
  current,
  icon: Icon,
  id,
  labelNode,
}: {
  href: string;
  label: string;
  current: boolean;
  icon: () => React.JSX.Element;
  id?: string;
  // What shows under the icon, when it isn't just the label.
  labelNode?: React.ReactNode;
}) {
  return (
    <Link href={href} className="rbtn" aria-current={current} title={label} id={id}>
      <span className="ric">
        <Icon />
      </span>
      <span className="rlab">{labelNode ?? label}</span>
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
// now, and Settings opens from your picture's menu at the top right.
export function NavRail() {
  const pathname = usePathname();

  const routeClientId = pathname.match(/^\/clients\/([^/]+)/)?.[1];
  const routeProjectId = pathname.match(/^\/projects\/([^/]+)/)?.[1];
  const routeCreativeId = pathname.match(/^\/creatives\/([^/]+)/)?.[1];
  // The project and review pages only carry their own id in the URL; the
  // client (and, for a post, its project) come from the same cached queries
  // those pages already load, so this adds no extra request.
  const { data: project } = useProject(routeProjectId ?? "");
  const { data: creative } = useCreative(routeCreativeId ?? "");

  const clientId = routeClientId ?? project?.client_id ?? creative?.projects?.client_id;
  // Named for the client (direct instruction): "Casa Carigar Settings".
  const { data: client } = useClientDetail(clientId ?? "");
  const projectId = routeProjectId ?? creative?.project_id;
  const insideProject = !!routeProjectId || !!routeCreativeId;

  return (
    <nav className="rail" aria-label="Main">
      {/* The corner above, where Frank's logo sits (AppShell): the same
          height the agency's mark took, so the icons below stay put. */}
      <div className="rail-top" aria-hidden="true" />
      <RailLink href="/dashboard" label="Clients" icon={ClientsIcon} current={pathname.startsWith("/dashboard")} />
      {insideProject && clientId && (
        <RailLink
          href={`/clients/${clientId}`}
          label={client?.name ? `${client.name} Projects` : "Projects"}
          labelNode={
            client?.name ? (
              <>
                {/* Named for the client, as its Settings is (direct instruction). */}
                <span className="rlab-name">{client.name}</span> Projects
              </>
            ) : undefined
          }
          icon={ProjectsIcon}
          current={false}
        />
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
          label={client?.name ? `${client.name} Settings` : "Client Settings"}
          labelNode={
            client?.name ? (
              <>
                {/* A long name stops at two lines; Settings always shows. */}
                <span className="rlab-name">{client.name}</span> Settings
              </>
            ) : undefined
          }
          icon={SettingsIcon}
          current={pathname.startsWith(`/clients/${clientId}/settings`)}
          id="navClientSet"
        />
      )}
      <div className="spacer" />
    </nav>
  );
}
