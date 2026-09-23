"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useClientDetail } from "@/hooks/use-client";
import { useProjects, type ProjectListRow } from "@/hooks/use-projects";
import { useProjectCreativeStats } from "@/hooks/use-project-creative-stats";
import { useIsStaff } from "@/hooks/use-is-staff";
import { useUIStore } from "@/store/ui-store";
import { KBadge } from "@/components/project/KBadge";
import { NewProjectModal } from "@/components/project/NewProjectModal";
import { SearchIcon } from "@/components/app-shell/icons";

type Filter = "all" | "review" | "done";
type Sort = "due" | "name" | "pending";

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
  const { isStaff, isPending: isStaffPending } = useIsStaff();
  const previewMode = useUIStore((s) => s.previewMode);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("due");
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  // Fails closed like every other isStaff gate in this app: hidden while
  // still resolving, not shown by default.
  const confirmedStaff = isStaff && !isStaffPending;
  const isLoading = clientLoading || projectsLoading;

  function pendingFor(p: ProjectListRow) {
    const s = projectStats?.[p.id];
    return (s?.waitingOnApproval ?? 0) + (s?.feedbackToAction ?? 0);
  }

  const filtered = useMemo(() => {
    if (!projects) return [];
    const q = query.trim().toLowerCase();
    let list = projects.filter((p) => {
      const pend = pendingFor(p);
      const matchesFilter =
        filter === "all" ? true : filter === "review" ? pend > 0 : pend === 0;
      const matchesQuery =
        !q || (p.name + " " + (p.type ?? "")).toLowerCase().includes(q);
      return matchesFilter && matchesQuery;
    });
    list = [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "pending") return pendingFor(b) - pendingFor(a);
      // due — no deadline sorts last, matching the prototype's fallback
      // date (a fixed high 'd' value for "No deadline" rows).
      if (!a.due_on && !b.due_on) return 0;
      if (!a.due_on) return 1;
      if (!b.due_on) return -1;
      return a.due_on.localeCompare(b.due_on);
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, query, filter, sort, projectStats]);

  // "Campaigns" heading stat: the prototype's own projStats() counts
  // distinct campaign tags on each schedule/work item, a concept this
  // schema has no column for (see docs/parity-gaps.md). Distinct project
  // `type` among this client's active projects is the closest real,
  // schema-backed stand-in rather than a fabricated column — an
  // approximation, not the same metric, flagged as such there.
  const campaignCount = useMemo(() => {
    if (!projects) return 0;
    return new Set(projects.map((p) => p.type).filter((t): t is string => !!t)).size;
  }, [projects]);

  const waitingOnClient = useMemo(() => {
    if (!projectStats) return 0;
    return Object.values(projectStats).reduce((n, s) => n + s.waitingOnApproval, 0);
  }, [projectStats]);

  const approvedCount = useMemo(() => {
    if (!projectStats) return 0;
    return Object.values(projectStats).reduce((n, s) => n + s.done, 0);
  }, [projectStats]);

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
      <p className="sub">
        {previewMode === "client"
          ? "Pick a project to see what is scheduled."
          : "Pick a project to open its calendar."}
      </p>

      <div className="stats">
        <div className="stat">
          <div className="n">{projects?.length ?? 0}</div>
          <div className="l">Live Projects</div>
        </div>
        <div className="stat">
          <div className="n">{campaignCount}</div>
          <div className="l">Campaigns</div>
        </div>
        <div className="stat">
          <div className={`n${statsPending ? "" : " flag"}`}>
            {statsPending ? "…" : waitingOnClient}
          </div>
          <div className="l">
            {previewMode === "client" ? "Waiting on You" : "Waiting on Client"}
          </div>
        </div>
        <div className="stat">
          <div className="n">{statsPending ? "…" : approvedCount}</div>
          <div className="l">Approved</div>
        </div>
      </div>

      <div className="listsearch">
        <SearchIcon />
        <input
          placeholder="Search projects"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="secthead">
        <h2>All Projects</h2>
        <span className="count">
          {filtered.length} project{filtered.length === 1 ? "" : "s"}
        </span>
        <div className="filters">
          <button
            className="chip"
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
            type="button"
          >
            All
          </button>
          <button
            className="chip"
            aria-pressed={filter === "review"}
            onClick={() => setFilter("review")}
            type="button"
          >
            Needs Review
          </button>
          <button
            className="chip"
            aria-pressed={filter === "done"}
            onClick={() => setFilter("done")}
            type="button"
          >
            Approved
          </button>
          <select
            className="sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
          >
            <option value="due">Deadline</option>
            <option value="name">Name A–Z</option>
            <option value="pending">Most Pending</option>
          </select>
          {confirmedStaff && (
            <button
              className="btn sm"
              type="button"
              onClick={() => setNewProjectOpen(true)}
            >
              New Project
            </button>
          )}
        </div>
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

      {!projectsError && !isLoading && filtered.length === 0 && (
        <div className="empty">
          <b>
            {query
              ? `No projects match “${query}”`
              : projects?.length
                ? "Nothing here yet"
                : "No projects yet"}
          </b>
          <span>
            {query
              ? "Try a different search."
              : projects?.length
                ? "Try a different filter."
                : previewMode === "client"
                  ? "Your team is setting things up. You will get an email when there is something to review."
                  : `Create the first project for ${client?.name ?? "this client"} to start scheduling or briefing work.`}
          </span>
          {confirmedStaff && !projects?.length && (
            <div style={{ marginTop: 14 }}>
              <button
                className="btn primary"
                type="button"
                onClick={() => setNewProjectOpen(true)}
              >
                New Project
              </button>
            </div>
          )}
        </div>
      )}

      {!projectsError && filtered.length > 0 && (
        <div className="clients">
          <div className="crow head">
            <div>Project</div>
            <div>Posts</div>
            <div>Approval progress</div>
            <div>Status</div>
            <div className="ago">Due</div>
            <div></div>
          </div>
          {filtered.map((p) => {
            const s = projectStats?.[p.id];
            const total = s?.total ?? 0;
            const done = s?.done ?? 0;
            const pending = pendingFor(p);
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

      {newProjectOpen && (
        <NewProjectModal clientId={id} onClose={() => setNewProjectOpen(false)} />
      )}
    </div>
  );
}
