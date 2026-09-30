"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useClientDetail } from "@/hooks/use-client";
import { useProjects, type ProjectListRow } from "@/hooks/use-projects";
import { useArchiveProject } from "@/hooks/use-archive-project";
import { useProjectCreativeStats } from "@/hooks/use-project-creative-stats";
import { useIsStaff } from "@/hooks/use-is-staff";
import { useUIStore } from "@/store/ui-store";
import { useProjectFolders, type ProjectFolderRow } from "@/hooks/use-project-folders";
import { useDeleteProjectFolder } from "@/hooks/use-delete-project-folder";
import { KBadge } from "@/components/project/KBadge";
import { NewProjectModal } from "@/components/project/NewProjectModal";
import { RenameProjectModal } from "@/components/project/RenameProjectModal";
import { FolderModal } from "@/components/project/FolderModal";
import { MoveToFolderModal } from "@/components/project/MoveToFolderModal";
import { RowActionsMenu } from "@/components/ui/RowActionsMenu";
import { SearchIcon } from "@/components/app-shell/icons";

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
  const { data: folders } = useProjectFolders(id);
  const deleteFolder = useDeleteProjectFolder();

  const [query, setQuery] = useState("");
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("active");
  const [sort, setSort] = useState<Sort>("due");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [renameProjectTarget, setRenameProjectTarget] = useState<ProjectListRow | null>(null);
  const [folderModal, setFolderModal] = useState<
    { mode: "create" } | { mode: "rename"; folder: ProjectFolderRow } | null
  >(null);
  const [moveTarget, setMoveTarget] = useState<ProjectListRow | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  function toggleFolderCollapsed(folderId: string) {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

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
      const matchesQuery =
        !q || (p.name + " " + (p.type ?? "")).toLowerCase().includes(q);
      return matchesArchive && matchesQuery;
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
  }, [projects, query, archiveFilter, sort, projectStats]);

  // Unfiled projects show in the flat list above the folders, per direct
  // instruction — folders are an organisational layer on top of the same
  // filtered/sorted list, not a separate one.
  const unfiled = useMemo(() => filtered.filter((p) => !p.folder_id), [filtered]);

  function renderProjectRow(p: ProjectListRow) {
    const s = projectStats?.[p.id];
    return (
      <Link
        href={`/projects/${p.id}`}
        className="crow"
        style={{ gridTemplateColumns: PROJECT_ROW_COLUMNS }}
        key={p.id}
      >
        <div className="cname">
          <div className="logo" style={{ background: p.accent_colour || "#6B7280" }}>
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
        <div className="stagecount ago">{statsPending ? "…" : (s?.byStage[0] ?? 0)}</div>
        <div className="stagecount ago">{statsPending ? "…" : (s?.byStage[1] ?? 0)}</div>
        <div className="stagecount ago">{statsPending ? "…" : (s?.byStage[2] ?? 0)}</div>
        <div className="ago">{formatDate(s?.latestApprovedAt ?? null)}</div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          {confirmedStaff && (
            <RowActionsMenu
              title="Project options"
              items={[
                { label: "Rename", onClick: () => setRenameProjectTarget(p) },
                { label: "Move to folder", onClick: () => setMoveTarget(p) },
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
  }

  // Same three stage buckets the table's own Concept/Internal Review/
  // Client Review columns show per project (byStage[0..2]), just summed
  // across every active project instead — real, schema-backed counts,
  // not an approximation like the "Campaigns" stat this replaced.
  const conceptCount = useMemo(() => {
    if (!projectStats) return 0;
    return Object.values(projectStats).reduce((n, s) => n + s.byStage[0], 0);
  }, [projectStats]);

  const internalReviewCount = useMemo(() => {
    if (!projectStats) return 0;
    return Object.values(projectStats).reduce((n, s) => n + s.byStage[1], 0);
  }, [projectStats]);

  const clientReviewCount = useMemo(() => {
    if (!projectStats) return 0;
    return Object.values(projectStats).reduce((n, s) => n + s.byStage[2], 0);
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
          <div className="n">{statsPending ? "…" : conceptCount}</div>
          <div className="l">Concepts</div>
        </div>
        <div className="stat">
          <div className="n">{statsPending ? "…" : internalReviewCount}</div>
          <div className="l">Internal Review</div>
        </div>
        <div className="stat">
          <div className="n">{statsPending ? "…" : clientReviewCount}</div>
          <div className="l">Client Review</div>
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
              onClick={() => setFolderModal({ mode: "create" })}
            >
              Add Folder
            </button>
          )}
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
            <div style={{ fontSize: 13 }}>Project</div>
            <div className="ago">Concept</div>
            <div className="ago">Internal Review</div>
            <div className="ago">Client Review</div>
            <div className="ago">Latest Approved</div>
            <div></div>
          </div>
          {unfiled.map((p) => renderProjectRow(p))}
          {(folders ?? []).map((f) => {
            const folderProjects = filtered.filter((p) => p.folder_id === f.id);
            const isOpen = !collapsedFolders.has(f.id);
            return (
              <div key={f.id}>
                <div
                  className={`crow folder-band${isOpen ? " open" : ""}`}
                  style={{ padding: "var(--d-row-y) var(--d-row-x)" }}
                  onClick={() => toggleFolderCollapsed(f.id)}
                >
                  <svg className="chev" viewBox="0 0 24 24">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                  <b>{f.name}</b>
                  <span className="count">
                    {folderProjects.length} project{folderProjects.length === 1 ? "" : "s"}
                  </span>
                  <div className="grow" />
                  {confirmedStaff && (
                    <RowActionsMenu
                      title="Folder options"
                      items={[
                        { label: "Rename", onClick: () => setFolderModal({ mode: "rename", folder: f }) },
                        {
                          label: "Delete",
                          tone: "danger",
                          onClick: () => deleteFolder.mutate({ folderId: f.id, clientId: id }),
                        },
                      ]}
                    />
                  )}
                </div>
                {isOpen && folderProjects.map((p) => renderProjectRow(p))}
              </div>
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

      {folderModal && (
        <FolderModal
          clientId={id}
          folder={folderModal.mode === "rename" ? folderModal.folder : null}
          onClose={() => setFolderModal(null)}
        />
      )}

      {moveTarget && (
        <MoveToFolderModal
          projectId={moveTarget.id}
          clientId={id}
          projectName={moveTarget.name}
          currentFolderId={moveTarget.folder_id}
          folders={folders ?? []}
          onClose={() => setMoveTarget(null)}
        />
      )}
    </div>
  );
}
