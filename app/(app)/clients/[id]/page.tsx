"use client";

import { use } from "react";
import Link from "next/link";
import { useClientDetail } from "@/hooks/use-client";
import { useProjects } from "@/hooks/use-projects";
import { useProjectCreativeStats } from "@/hooks/use-project-creative-stats";
import { useUIStore } from "@/store/ui-store";
import { KBadge } from "@/components/project/KBadge";

function projectInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function ClientWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const {
    data: client,
    isLoading: clientLoading,
    isError: clientError,
  } = useClientDetail(id);
  const {
    data: projects,
    isLoading: projectsLoading,
    isError: projectsError,
    error: projectsErrorObj,
  } = useProjects(id);
  const { data: projectStats, isPending: statsPending } =
    useProjectCreativeStats(id);
  const previewMode = useUIStore((s) => s.previewMode);

  const isLoading = clientLoading || projectsLoading;

  if (clientError) {
    return (
      <div className="pad">
        <div className="empty">
          <b>Couldn&rsquo;t load this client</b>
          <span>It may have been archived, or you may not have access.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="pad">
      <h1 className="h1">{client?.name ?? "Client"}</h1>
      <p className="sub">{client?.industry || "Workspace"}</p>

      <div className="secthead">
        <h2>Projects</h2>
        <span className="count">
          {projects?.length ?? 0} project{projects?.length === 1 ? "" : "s"}
        </span>
      </div>

      {projectsError && (
        <div className="empty">
          <b>Couldn&rsquo;t load projects</b>
          <span>
            {projectsErrorObj instanceof Error
              ? projectsErrorObj.message
              : "Unknown error"}
          </span>
        </div>
      )}

      {!projectsError && !isLoading && projects?.length === 0 && (
        <div className="empty">
          <b>No projects yet</b>
          <span>Projects created for this client will show up here.</span>
        </div>
      )}

      {!projectsError && projects && projects.length > 0 && (
        <div className="clients">
          <div className="crow head">
            <div>Project</div>
            <div>Creatives</div>
            <div>Approval progress</div>
            <div>Status</div>
            <div className="ago">Due</div>
            <div></div>
          </div>
          {projects.map((p) => {
            const s = projectStats?.[p.id];
            const total = s?.total ?? 0;
            const done = s?.done ?? 0;
            const pending = (s?.waitingOnApproval ?? 0) + (s?.feedbackToAction ?? 0);
            // Same shape as the prototype's projStats()-driven status tag:
            // pend is the two "needs attention" bands combined into one
            // count, not shown as separate tag states at the project-row
            // level (that split only applies to the dashboard's stat cards).
            const status = !total
              ? { tone: "grey", label: "Not started" }
              : pending > 0
                ? {
                    tone: "amber",
                    label: `${pending} ${previewMode === "client" ? "need your review" : "with the client"}`,
                  }
                : done === total
                  ? { tone: "green", label: "All approved" }
                  : { tone: "blue", label: "In production" };
            return (
              <Link href={`/projects/${p.id}`} className="crow" key={p.id}>
                <div className="cname">
                  <div
                    className="logo"
                    style={{ background: p.accent_colour || "#6B7280" }}
                  >
                    {projectInitials(p.name)}
                  </div>
                  <div className="t">
                    <b>{p.name}</b>
                    <span className="sub">
                      <KBadge delivery={p.delivery} />
                      <span>{p.type || "—"}</span>
                    </span>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: "var(--muted)" }}>
                  {statsPending ? "…" : `${total} total`}
                </div>
                <div>
                  <div className="bar">
                    <i
                      style={{
                        width: `${total ? Math.round((done / total) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  <div className="barlbl">
                    {statsPending ? "…" : `${done} of ${total} approved`}
                  </div>
                </div>
                <div>
                  <span className={`tag ${status.tone}`}>
                    <span className="dot" />
                    {statsPending ? "…" : status.label}
                  </span>
                </div>
                <div className="ago">{formatDate(p.due_on)}</div>
                <div></div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
