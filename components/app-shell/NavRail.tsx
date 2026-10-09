"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProject } from "@/hooks/use-project";
import { useCreative } from "@/hooks/use-creative";
import { useClientDetail } from "@/hooks/use-client";
import { usePresence } from "@/hooks/use-presence";
import { CalendarIcon, ClientIcon, ClientsIcon, SettingsIcon } from "./icons";

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
//   anywhere inside a client — Clients, the client (by name, its page),
//                              Client Settings
//   a project's table, and a post's review page
//                            — and the project's Content Planner (or Other
//                              Content; current on the table), before
//                              Client Settings
// Knowledge is a page of Client Settings now, and Settings opens from your
// picture's menu at the top right.
//
// Nothing flashes between pages (direct instruction): a project's or post's
// page learns its client from its own data, so while that loads the rail
// keeps the client (and project) it already had rather than dropping them;
// a link that really comes or goes slides in or out with the site's own
// open and close motion (usePresence).
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
  const insideClient = !!(routeClientId || routeProjectId || routeCreativeId);

  // The client and project last known, kept while the next page's own data
  // loads and while their links animate out (React's way to keep a value
  // from earlier renders: set while rendering).
  const knownClient = routeClientId ?? project?.client_id ?? creative?.projects?.client_id;
  const knownProject = routeProjectId ?? creative?.project_id;
  const knownDelivery = (routeProjectId ? project?.delivery : creative?.projects?.delivery) ?? undefined;
  const [keptClient, setKeptClient] = useState(knownClient);
  const [keptProject, setKeptProject] = useState({ id: knownProject, delivery: knownDelivery });
  if (knownClient && knownClient !== keptClient) setKeptClient(knownClient);
  if (knownProject && (knownProject !== keptProject.id || knownDelivery !== keptProject.delivery)) {
    setKeptProject({ id: knownProject, delivery: knownDelivery });
  }
  const clientId = knownClient ?? keptClient;
  const projectId = knownProject ?? keptProject.id;
  const delivery = knownDelivery ?? keptProject.delivery;

  // Named for the client (direct instruction): "Casa Carigar Settings".
  const { data: client } = useClientDetail(clientId ?? "");

  return (
    <nav className="rail" aria-label="Main">
      {/* The corner above, where Frank's logo sits (AppShell): the same
          height the agency's mark took, so the icons below stay put. */}
      <div className="rail-top" aria-hidden="true" />
      <RailLink href="/dashboard" label="Clients" icon={ClientsIcon} current={pathname.startsWith("/dashboard")} />
      {/* The client you're in, by name (direct instruction): its page, from
          its settings, a project, a table or a post. */}
      <RailSlot show={insideClient && !!clientId}>
        <RailLink
          href={`/clients/${clientId}`}
          label={client?.name ?? "Client"}
          labelNode={<span className="rlab-name">{client?.name ?? "\u00a0"}</span>}
          icon={ClientIcon}
          current={pathname === `/clients/${clientId}`}
          id="navClient"
        />
      </RailSlot>
      {/* The project's table: on it (current) and on its posts (direct
          instruction). */}
      <RailSlot show={(!!routeProjectId || !!routeCreativeId) && !!projectId}>
        <RailLink
          href={`/projects/${projectId}`}
          label={delivery === "continuous" ? "Other Content" : "Content Planner"}
          icon={CalendarIcon}
          current={pathname === `/projects/${projectId}`}
        />
      </RailSlot>
      <RailSlot show={insideClient && !!clientId}>
        <RailLink
          href={`/clients/${clientId}/settings`}
          label={client?.name ? `${client.name} Settings` : "Client Settings"}
          labelNode={
            <>
              {/* A long name stops at two lines; Settings always shows. */}
              <span className="rlab-name">{client?.name ?? "\u00a0"}</span> Settings
            </>
          }
          icon={SettingsIcon}
          current={pathname.startsWith(`/clients/${clientId}/settings`)}
          id="navClientSet"
        />
      </RailSlot>
      <div className="spacer" />
    </nav>
  );
}

// A rail link that comes and goes: in with the site's opening motion, out
// with its closing one, the links below sliding up or down to make room.
// Its content stays the last client's while it closes (NavRail keeps it).
function RailSlot({ show, children }: { show: boolean; children: React.ReactNode }) {
  const { shown, isOpen } = usePresence(show);
  if (!shown) return null;
  return (
    <div className={`rail-slot${isOpen ? " is-open" : ""}`}>
      <div className="rail-slot-in">{children}</div>
    </div>
  );
}
