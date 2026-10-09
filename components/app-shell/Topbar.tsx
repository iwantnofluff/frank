"use client";

import { useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useClientDetail } from "@/hooks/use-client";
import { useProject } from "@/hooks/use-project";
import { useCreative } from "@/hooks/use-creative";
import { useNotifications, type NotificationRow } from "@/hooks/use-notifications";
import { BellIcon, HelpIcon } from "./icons";
import { GlobalSearch } from "./GlobalSearch";
import { HelpPanel } from "./HelpPanel";
import { NotificationsPanel } from "./NotificationsPanel";
import { useMarkReleasesSeen, useReleasesSeen } from "@/hooks/use-releases-seen";
import { CURRENT_RELEASE, RELEASES } from "@/lib/releases";
import { compareVersions } from "@/lib/release-version";
import { HeaderBrand } from "./HeaderBrand";
import { AccountMenu } from "./AccountMenu";
import { useIsStaff } from "@/hooks/use-is-staff";
import { ArtworkDecisionModal } from "./ArtworkDecisionModal";

const STATIC_CRUMBS: Record<string, string> = {
  "/dashboard": "All Clients",
  "/calendar": "Calendar",
  "/analytics": "Analytics",
  "/visibility": "Client visibility",
  "/settings": "Settings",
};

function AllClientsCrumbLink() {
  const router = useRouter();
  return (
    <button type="button" onClick={() => router.push("/dashboard")}>
      All Clients
    </button>
  );
}

function ClientCrumb({
  clientId,
  knowledge,
}: {
  clientId: string;
  knowledge: boolean;
}) {
  const router = useRouter();
  const { data: client } = useClientDetail(clientId);

  return (
    <>
      <AllClientsCrumbLink />
      <span className="sep">/</span>
      {knowledge ? (
        <>
          <button
            type="button"
            onClick={() => router.push(`/clients/${clientId}`)}
          >
            {client?.name ?? "—"}
          </button>
          <span className="sep">/</span>
          <b>Knowledge</b>
        </>
      ) : (
        <b>{client?.name ?? "—"}</b>
      )}
    </>
  );
}

function ProjectCrumb({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { data: project } = useProject(projectId);

  return (
    <>
      <AllClientsCrumbLink />
      <span className="sep">/</span>
      {project?.client_id ? (
        <button
          type="button"
          onClick={() => router.push(`/clients/${project.client_id}`)}
        >
          {project.clients?.name ?? "—"}
        </button>
      ) : (
        <b>—</b>
      )}
      <span className="sep">/</span>
      <b>{project?.name ?? "—"}</b>
    </>
  );
}

function CreativeCrumb({ creativeId }: { creativeId: string }) {
  const router = useRouter();
  const { data: creative } = useCreative(creativeId);
  const project = creative?.projects;

  return (
    <>
      <AllClientsCrumbLink />
      <span className="sep">/</span>
      {project?.client_id ? (
        <button
          type="button"
          onClick={() => router.push(`/clients/${project.client_id}`)}
        >
          {project.clients?.name ?? "—"}
        </button>
      ) : (
        <b>—</b>
      )}
      <span className="sep">/</span>
      {project?.id ? (
        <button
          type="button"
          onClick={() => router.push(`/projects/${project.id}`)}
        >
          {project.name}
        </button>
      ) : (
        <b>—</b>
      )}
      <span className="sep">/</span>
      <b>{creative?.name ?? "—"}</b>
    </>
  );
}

function StaticCrumb({ pathname }: { pathname: string }) {
  const match = Object.keys(STATIC_CRUMBS).find((prefix) =>
    pathname.startsWith(prefix),
  );
  return <b>{match ? STATIC_CRUMBS[match] : "Frank"}</b>;
}

// Client Settings (direct instruction): All Clients / the client / Client
// Settings.
function ClientSettingsCrumb({ clientId }: { clientId: string }) {
  const router = useRouter();
  const { data: client } = useClientDetail(clientId);
  return (
    <>
      <AllClientsCrumbLink />
      <span className="sep">/</span>
      <button type="button" onClick={() => router.push(`/clients/${clientId}`)}>
        {client?.name ?? "—"}
      </button>
      <span className="sep">/</span>
      {/* Named for the client, as the rail's button is (direct instruction). */}
      <b>{client?.name ? `${client.name} Settings` : "Client Settings"}</b>
    </>
  );
}

function Crumb({ pathname }: { pathname: string }) {
  const settingsMatch = pathname.match(/^\/clients\/([^/]+)\/settings(\/|$)/);
  if (settingsMatch) return <ClientSettingsCrumb clientId={settingsMatch[1]} />;

  const clientMatch = pathname.match(/^\/clients\/([^/]+)(\/knowledge)?\/?$/);
  if (clientMatch) {
    return (
      <ClientCrumb clientId={clientMatch[1]} knowledge={!!clientMatch[2]} />
    );
  }

  const projectMatch = pathname.match(/^\/projects\/([^/]+)\/?$/);
  if (projectMatch) {
    return <ProjectCrumb projectId={projectMatch[1]} />;
  }

  const creativeMatch = pathname.match(/^\/creatives\/([^/]+)\/?$/);
  if (creativeMatch) {
    return <CreativeCrumb creativeId={creativeMatch[1]} />;
  }

  return <StaticCrumb pathname={pathname} />;
}

// The header (direct instruction): Frank's logo and the agency's, where
// you are, search, the bell, Help, and your picture with its menu. The "Preview as" switch is gone (each person sees their own view).
// The bell is back for notifications (phase60), its count the unread ones.
export function Topbar({
  userInitials,
  userName,
  userEmail,
}: {
  userInitials: string;
  userName: string | null;
  userEmail: string;
}) {
  const pathname = usePathname();
  const { isStaff, isPending: staffPending } = useIsStaff();
  const [helpOpen, setHelpOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [deciding, setDeciding] = useState<NonNullable<NotificationRow["creative"]> | null>(null);
  const router = useRouter();
  const bell = useRef<HTMLButtonElement>(null);
  const { data: notifications } = useNotifications();
  // New versions of Frank, for the team (direct instruction): those newer
  // than the last seen, or just the newest for someone who's seen none.
  const team = isStaff && !staffPending;
  const { data: seen } = useReleasesSeen(team);
  const markReleasesSeen = useMarkReleasesSeen();
  const newReleases = !team || !seen
    ? []
    : seen.seen
      ? RELEASES.filter((r) => compareVersions(r.version, seen.seen!) < 0)
      : [CURRENT_RELEASE];
  const unread = (notifications ?? []).filter((n) => !n.read_at).length + newReleases.length;

  return (
    <header className="topbar">
      <HeaderBrand />
      <div className="crumb">
        <Crumb pathname={pathname} />
      </div>
      <div className="grow" />
      <GlobalSearch />
      <button
        ref={bell}
        className="bell"
        type="button"
        title="Notifications"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={notifOpen}
        onClick={() => {
          setNotifOpen((o) => !o);
          setHelpOpen(false);
        }}
      >
        <BellIcon />
        {unread > 0 && <span className="cnt">{unread > 99 ? "99+" : unread}</span>}
      </button>
      <NotificationsPanel
        open={notifOpen}
        items={notifications ?? []}
        anchor={bell}
        onClose={() => setNotifOpen(false)}
        releases={newReleases}
        onReadReleases={() => markReleasesSeen.mutate(CURRENT_RELEASE.version)}
        onOpenRelease={(r) => {
          setNotifOpen(false);
          markReleasesSeen.mutate(CURRENT_RELEASE.version);
          router.push(`/settings/general/updates#v${r.version.replace(/\./g, "-")}`);
        }}
        onOpenItem={(n) => {
          setNotifOpen(false);
          if (!n.creative) return;
          // The client's comment or approval: the post itself (phase80).
          if (n.kind !== "artwork_removal") router.push(`/creatives/${n.creative.id}`);
          else setDeciding(n.creative);
        }}
      />
      {deciding && <ArtworkDecisionModal post={deciding} onClose={() => setDeciding(null)} />}
      <button
        className="bell helpbtn"
        type="button"
        title="Help"
        aria-label="Help"
        aria-expanded={helpOpen}
        onClick={() => {
          setHelpOpen((o) => !o);
          setNotifOpen(false);
        }}
      >
        <HelpIcon />
      </button>
      <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
      <span className="tsep" aria-hidden="true" />
      <AccountMenu initials={userInitials} name={userName} email={userEmail} showSettings={isStaff && !staffPending} />
    </header>
  );
}
