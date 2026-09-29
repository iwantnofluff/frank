"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useClientDetail } from "@/hooks/use-client";
import { useProjects, type ProjectListRow } from "@/hooks/use-projects";
import { useArchiveProject } from "@/hooks/use-archive-project";
import { useProjectCreativeStats } from "@/hooks/use-project-creative-stats";
import { useIsStaff } from "@/hooks/use-is-staff";
import { useUIStore } from "@/store/ui-store";
import { KBadge } from "@/components/project/KBadge";
import { NewProjectModal } from "@/components/project/NewProjectModal";
import { RenameProjectModal } from "@/components/project/RenameProjectModal";
import { RowActionsMenu } from "@/components/ui/RowActionsMenu";
import { SearchIcon } from "@/components/app-shell/icons";

type Filter = "all" | "review" | "done";
type ArchiveFilter = "active" | "archived";
type Sort = "due" | "name" | "pending";

// Explicit per-page override of .crow's own default template (same
// pattern Settings > Team already uses). The last two tracks (date, then
// the actions menu) are kept the same width as the dashboard's own
// CLIENT_ROW_COLUMNS so the "..." button lands in an identically-sized,
// identically-positioned slot regardless of which page it's on — true
// regardless of how many columns sit in between, since the leading `1fr`
// track absorbs any difference.
const PROJECT_ROW_COLUMNS = "1fr 74px 96px 90px 92px 70px";

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
  const archiveProject = useArchiveProject();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("active");
  const [sort, setSort] = useState<Sort>("due");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [renameProjectTarget, setRenameProjectTarget] = useState<ProjectListRow | null>(null);

  // Fails closed like every other isStaff gate in this app: hidden while
  // still resolving, not shown by default.
  const confirmedStaff = isStaff && !isStaffPending;
  const isLoading = clientLoading || projectsLoading;

  function pendingFor(p: ProjectListRow) {
    const s = projectStats?.[p.id];
    return (s?.waitingOnApproval ?? 0) + (s?.feedbackToAction ?? 0);
  }

  // useProjects now returns archived projects too (so they can be seen and
  // unarchived at all) — every stat/heuristic below that means "the
  // client's real, active work" reads this instead of the raw list.
  const activeProjects = useMemo(
    () => (projects ?? []).filter((p) => !p.archived_at),
    [projects],
  );

  const filtered = useMemo(() => {
    if (!projects) return [];
    const q = query.trim().toLowerCase();
    let list = projects.filter((p) => {
      const matchesArchive = archiveFilter === "active" ? !p.archived_at : !!p.archived_at;
      const pend = pendingFor(p);
      const matchesFilter =
        filter === "all" ? true : filter === "review" ? pend > 0 : pend === 0;
      const matchesQuery =
        !q || (p.name + " " + (p.type ?? "")).toLowerCase().includes(q);
      return matchesArchive && matchesFilter && matchesQuery;
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
  }, [projects, query, filter, archiveFilter, sort, projectStats]);

  // "Campaigns" heading stat: the prototype's own projStats() counts
  // distinct campaign tags on each schedule/work item, a concept this
  // schema has no column for (see docs/parity-gaps.md). Distinct project
  // `type` among this client's active projects is the closest real,
  // schema-backed stand-in rather than a fabricated column — an
  // approximation, not the same metric, flagged as such there.
  const campaignCount = useMemo(() => {
    return new Set(activeProjects.map((p) => p.type).filter((t): t is string => !!t)).size;
  }, [activeProjects]);

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
          <div className="n">{activeProjects.length}</div>
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
            aria-pressed={archiveFilter === "active"}
            onClick={() => setArchiveFilter("active")}
            type="button"
          >
            Active
          </button>
          <button
            className="chip"
            aria-pressed={archiveFilter === "archived"}
            onClick={() => setArchiveFilter("archived")}
            type="button"
          >
            Archived
          </button>
          <span className="toolsep" />
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
              : archiveFilter === "archived"
                ? "No archived projects"
                : activeProjects.length
                  ? "Nothing here yet"
                  : "No projects yet"}
          </b>
          <span>
            {query
              ? "Try a different search."
              : archiveFilter === "archived"
                ? "Nothing has been archived yet."
                : activeProjects.length
                  ? "Try a different filter."
                  : previewMode === "client"
                    ? "Your team is setting things up. You will get an email when there is something to review."
                    : `Create the first project for ${client?.name ?? "this client"} to start scheduling or briefing work.`}
          </span>
          {confirmedStaff && archiveFilter === "active" && !activeProjects.length && (
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
          <div className="crow head" style={{ gridTemplateColumns: PROJECT_ROW_COLUMNS }}>
            <div>Project</div>
            <div className="ago">Concept</div>
            <div className="ago">Internal Review</div>
            <div className="ago">Client Review</div>
            <div className="ago">Latest Approved</div>
            <div></div>
          </div>
          {filtered.map((p) => {
            const s = projectStats?.[p.id];
            return (
              <Link
                href={`/projects/${p.id}`}
                className="crow"
                style={{ gridTemplateColumns: PROJECT_ROW_COLUMNS }}
                key={p.id}
              >
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
                <div className="stagecount ago">
                  {statsPending ? "…" : (s?.byStage[0] ?? 0)}
                </div>
                <div className="stagecount ago">
                  {statsPending ? "…" : (s?.byStage[1] ?? 0)}
                </div>
                <div className="stagecount ago">
                  {statsPending ? "…" : (s?.byStage[2] ?? 0)}
                </div>
                <div className="ago">{formatDate(s?.latestApprovedAt ?? null)}</div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  {confirmedStaff && (
                    <RowActionsMenu
                      title="Project options"
                      items={[
                        { label: "Rename", onClick: () => setRenameProjectTarget(p) },
                        {
                          label: p.archived_at ? "Unarchive" : "Archive",
                          onClick: () =>
                            archiveProject.mutate({
                              projectId: p.id,
                              clientId: id,
                              archived: !p.archived_at,
                            }),
                        },
                      ]}
                    />
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {newProjectOpen && (
        <NewProjectModal clientId={id} onClose={() => setNewProjectOpen(false)} />
      )}

      {renameProjectTarget && (
        <RenameProjectModal
          projectId={renameProjectTarget.id}
          clientId={id}
          currentName={renameProjectTarget.name}
          onClose={() => setRenameProjectTarget(null)}
        />
      )}
    </div>
  );
}
