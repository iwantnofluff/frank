"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useClientDetail } from "@/hooks/use-client";
import { useProjects, type ProjectListRow } from "@/hooks/use-projects";
import { useProjectCreativeStats } from "@/hooks/use-project-creative-stats";
import { useIsStaff } from "@/hooks/use-is-staff";
import { useProjectFolders, type ProjectFolderRow } from "@/hooks/use-project-folders";
import { useDeleteProjectFolder } from "@/hooks/use-delete-project-folder";
import { KBadge } from "@/components/project/KBadge";
import { NewProjectModal } from "@/components/project/NewProjectModal";
import { FolderModal } from "@/components/project/FolderModal";
import { RowActionsMenu } from "@/components/ui/RowActionsMenu";
import { BrandReminder } from "@/components/clients/BrandReminder";
import { useProjectSortStore, type ProjectSort } from "@/store/project-sort-store";

// How a client's projects can be ordered (direct instruction, in place of
// searching them).
const PROJECT_SORTS: { id: ProjectSort; label: string }[] = [
  { id: "latest", label: "Latest activity" },
  { id: "name", label: "A–Z" },
  { id: "added", label: "Recently added" },
  { id: "deadline", label: "Deadline" },
];

type ArchiveFilter = "active" | "archived";

// Explicit per-page override of .crow's own default template (same
// pattern Settings > Team already uses). The last two tracks (date, then
// the actions menu) are kept the same width as the dashboard's own
// CLIENT_ROW_COLUMNS so the "..." button lands in an identically-sized,
// identically-positioned slot regardless of which page it's on — true
// regardless of how many columns sit in between, since the leading `1fr`
// track absorbs any difference.
// Status (128px) matches the dashboard's own Status column width.
const PROJECT_ROW_COLUMNS = "1fr 74px 96px 90px 128px 92px";

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
  // A client's own people get the client wording (it used to follow the
  // "Preview as" switch, now gone).
  const asClient = !isStaff && !isStaffPending;
  const { data: folders } = useProjectFolders(id);
  const deleteFolder = useDeleteProjectFolder();

  // Remembered in this browser, as a convenience.
  const { sort, setSort: chooseSort } = useProjectSortStore();
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("active");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [folderModal, setFolderModal] = useState<
    { mode: "create" } | { mode: "rename"; folder: ProjectFolderRow } | null
  >(null);
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

  // useProjects now returns archived projects too (so they can be seen and
  // unarchived at all) — every stat/heuristic below that means "the
  // client's real, active work" reads this instead of the raw list.
  const activeProjects = useMemo(
    () => (projects ?? []).filter((p) => !p.archived_at),
    [projects],
  );
  // Each chip counts its whole tab, not the current search — per direct
  // instruction the count moved here from beside the title.
  const archivedCount = (projects?.length ?? 0) - activeProjects.length;

  const filtered = useMemo(() => {
    if (!projects) return [];
    const list = projects.filter((p) => (archiveFilter === "active" ? !p.archived_at : !!p.archived_at));
    // The order picked (direct instruction). Latest: the newest post or
    // approval in it, else when it was made. Deadline, no deadline last:
    // the prototype's own default order.
    const latest = (p: ProjectListRow) => projectStats?.[p.id]?.latestActivityAt ?? p.created_at;
    return [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "added") return b.created_at.localeCompare(a.created_at);
      if (sort === "latest") return latest(b).localeCompare(latest(a));
      if (!a.due_on && !b.due_on) return 0;
      if (!a.due_on) return 1;
      if (!b.due_on) return -1;
      return a.due_on.localeCompare(b.due_on);
    });
  }, [projects, projectStats, sort, archiveFilter]);

  // Unfiled projects show in the flat list above the folders, per direct
  // instruction — folders are an organisational layer on top of the same
  // filtered/sorted list, not a separate one.
  const unfiled = useMemo(() => filtered.filter((p) => !p.folder_id), [filtered]);
  // Folders stay visible even once they're empty (a project moved out of
  // the last one leaves it for the user to delete) — so on the Active tab,
  // with no search, the table shows whenever there's a folder, not only
  // when there's a project row.
  const showTable =
    filtered.length > 0 || (archiveFilter === "active" && (folders?.length ?? 0) > 0);

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
          {/* Just its name, no picture (direct instruction). */}
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
        <div className="ago">
          <span className={`tag ${p.archived_at ? "grey" : "blue"}`}>
            <span className="dot" />
            {p.archived_at ? "Archived" : "Active"}
          </span>
        </div>
        <div className="ago">{formatDate(s?.latestApprovedAt ?? null)}</div>
      </Link>
    );
  }

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
        {client?.description
          ? client.description
          : asClient
            ? "Pick a project to see what is scheduled."
            : "Pick a project to open its calendar."}
      </p>

      {/* The brand at a glance, before the work (direct instruction); the
          stage counts that sat above it went for it (direct instruction),
          each project's own row still counts its posts by stage. */}
      <BrandReminder clientId={id} canEdit={isStaff && !isStaffPending} />

      <div className="secthead">
        <h2>All Projects</h2>
        <div className="filters">
          <button
            className="chip"
            aria-pressed={archiveFilter === "active"}
            onClick={() => setArchiveFilter("active")}
            type="button"
          >
            Active ({activeProjects.length})
          </button>
          <button
            className="chip"
            aria-pressed={archiveFilter === "archived"}
            onClick={() => setArchiveFilter("archived")}
            type="button"
          >
            Archived ({archivedCount})
          </button>
          {/* In place of searching (direct instruction): the order. */}
          <select
            className="sortsel"
            aria-label="Sort projects"
            value={sort}
            onChange={(e) => chooseSort(e.target.value as ProjectSort)}
          >
            {PROJECT_SORTS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          {confirmedStaff && <span className="toolsep" />}
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

      {!projectsError && !isLoading && !showTable && (
        <div className="empty">
          <b>
            {archiveFilter === "archived"
                ? "No archived projects"
                : activeProjects.length
                  ? "Nothing here yet"
                  : "No projects yet"}
          </b>
          <span>
            {archiveFilter === "archived"
                ? "Nothing has been archived yet."
                : activeProjects.length
                  ? "Try a different filter."
                  : asClient
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

      {!projectsError && showTable && (
        <div className="clients">
          <div className="crow head" style={{ gridTemplateColumns: PROJECT_ROW_COLUMNS }}>
            <div>Project</div>
            <div className="ago">Concept</div>
            <div className="ago">Internal Review</div>
            <div className="ago">Client Review</div>
            <div className="ago">Status</div>
            <div className="ago">Latest Approved</div>
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

      {folderModal && (
        <FolderModal
          clientId={id}
          folder={folderModal.mode === "rename" ? folderModal.folder : null}
          onClose={() => setFolderModal(null)}
        />
      )}
    </div>
  );
}
