"use client";

import { useRouter, usePathname } from "next/navigation";
import { useUIStore } from "@/store/ui-store";
import { useClientDetail } from "@/hooks/use-client";
import { useProject } from "@/hooks/use-project";
import { useCreative } from "@/hooks/use-creative";
import { BellIcon, SearchIcon } from "./icons";

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

function Crumb({ pathname }: { pathname: string }) {
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

export function Topbar() {
  const pathname = usePathname();
  const previewMode = useUIStore((s) => s.previewMode);
  const setPreviewMode = useUIStore((s) => s.setPreviewMode);

  return (
    <header className="topbar">
      <div className="crumb">
        <Crumb pathname={pathname} />
      </div>
      <div className="grow" />
      <div
        className="modeswitch"
        title="Preview only — in the live product each user sees one view"
      >
        <span className="msl">Preview as</span>
        <button
          type="button"
          aria-pressed={previewMode === "agency"}
          onClick={() => setPreviewMode("agency")}
        >
          Agency
        </button>
        <button
          type="button"
          aria-pressed={previewMode === "client"}
          onClick={() => setPreviewMode("client")}
        >
          Client
        </button>
      </div>
      <button className="search" type="button">
        <SearchIcon />
        Search
        <span className="kbd">⌘K</span>
      </button>
      <button className="bell" type="button" title="Notifications">
        <BellIcon />
        <span className="cnt">0</span>
      </button>
    </header>
  );
}
