"use client";

import { use, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useProject } from "@/hooks/use-project";
import { useLiveUpdates } from "@/hooks/use-live-updates";
import { useProjectPresence } from "@/hooks/use-project-presence";
import { PresenceAvatars } from "@/components/app-shell/PresenceAvatars";
import { useCreatives } from "@/hooks/use-creatives";
import { useCustomColumns } from "@/hooks/use-custom-columns";
import { useUpdateCreativeCx } from "@/hooks/use-update-creative-cx";
import { useIsStaff } from "@/hooks/use-is-staff";
import { SplitButton } from "@/components/ui/SplitButton";
import { errorMessage } from "@/lib/errors";
import { CreativeModal } from "@/components/creative-review/CreativeModal";
import { ProjectCalendarTable } from "@/components/project/ProjectCalendarTable";
import { ContinuousCalendarTable } from "@/components/project/ContinuousCalendarTable";
import { ProjectSettings } from "@/components/project/ProjectSettings";
import { ProjectPanel, type ProjectPanelView } from "@/components/project/ProjectPanel";
import { RowActionsMenu } from "@/components/ui/RowActionsMenu";

type ArchiveFilter = "active" | "archived";

export default function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: project, isLoading: projectLoading } = useProject(id);
  const {
    data: creatives,
    isLoading: creativesLoading,
    isError,
    error,
  } = useCreatives(id);
  // Posts changed by anyone else show at once (phase82): a new post, a
  // stage, a date, a name.
  useLiveUpdates(`creatives:${id}`, [{ table: "creatives", filter: `project_id=eq.${id}` }], [["creatives", id]]);
  const { data: customColumns } = useCustomColumns(id);
  const updateCx = useUpdateCreativeCx(id);
  const { isStaff, isPending: isStaffPending } = useIsStaff();
  const [newBriefOpen, setNewBriefOpen] = useState(false);
  // New Post → Row: a draft row at the top of the table instead of the window.
  const [draftRowOpen, setDraftRowOpen] = useState(false);
  const draftRow = draftRowOpen
    ? {
        onClose: () => setDraftRowOpen(false),
        onCreated: (focusDate: string | null) => {
          setDraftRowOpen(false);
          if (focusDate) setCalendarFocusDate(focusDate);
        },
      }
    : null;
  const [calendarFocusDate, setCalendarFocusDate] = useState<string | null>(null);
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("active");
  // The project's profile (rename, details, people, folder, client,
  // archive, delete), from its "…" menu now its row's arrow on the client's
  // page has gone (direct instruction).
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Its Activity Log or Discussion, in a panel from the right (phase84).
  // A mention in the bell opens it on the Discussion (?panel=discussion).
  const asked = useSearchParams().get("panel");
  const wanted = asked === "discussion" || asked === "activity" ? asked : null;
  const [panel, setPanel] = useState<ProjectPanelView | null>(wanted);
  // Asked again while already here (another mention): opened then too.
  const [lastAsked, setLastAsked] = useState(asked);
  if (asked !== lastAsked) {
    setLastAsked(asked);
    if (wanted) setPanel(wanted);
  }
  const [movedNotice, setMovedNotice] = useState<string | null>(null);
  const router = useRouter();

  const isLoading = projectLoading || creativesLoading;
  const columns = customColumns ?? [];
  // Fails closed like every other isStaff gate this session: hidden/
  // read-only while still resolving, not shown/editable by default.
  const confirmedStaff = isStaff && !isStaffPending;
  // Who else on the team has this project open (phase82): the team only.
  const present = useProjectPresence(id, { viewing: null, editing: false }, confirmedStaff);
  // Entry point lives here rather than the topbar, same as the prototype's
  // own #briefWrap (only shown on the calendar view, not as a global nav
  // item) — docs/parity-gaps.md.
  const showNewBrief = confirmedStaff;

  // useCreatives now returns archived (deleted) posts too, same as
  // useProjects does for archived projects, so they can be seen and
  // restored — Active/Archived toggle mirrors the client workspace
  // page's own exact pattern.
  const activeCreatives = useMemo(
    () => (creatives ?? []).filter((c) => !c.archived_at),
    [creatives],
  );
  const visibleCreatives = useMemo(
    () =>
      (creatives ?? []).filter((c) =>
        archiveFilter === "active" ? !c.archived_at : !!c.archived_at,
      ),
    [creatives, archiveFilter],
  );

  return (
    <div className="pad">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <h1 className="h1">
            {/* The client, a thin vertical rule, then the project (direct
                instruction). Screen readers hear a dash between them. */}
            {project && project.delivery === "scheduled" ? (
              <>
                {project.clients?.name ?? "—"}
                <span className="h1sep"> — </span>
                {project.name}
              </>
            ) : (
              (project?.name ?? "Project")
            )}
          </h1>
          {(!project || project.delivery !== "scheduled") && (
            <p className="sub">
              {project?.clients?.name ?? "—"}
              {project && (
                <>
                  {" "}
                  · {project.delivery === "scheduled" ? "Content Planner" : "Other Content"}
                </>
              )}
            </p>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Who else on the team has this project open (phase82). */}
          <PresenceAvatars
            people={present}
            describe={(p) => {
              const post = p.viewing ? creatives?.find((c) => c.id === p.viewing)?.name : null;
              return post ? `${p.name}, ${p.editing ? "editing" : "on"} ${post}` : `${p.name}, on this table`;
            }}
          />
          {confirmedStaff && (
            <div className="filters">
              <button
                className="chip"
                type="button"
                aria-pressed={archiveFilter === "active"}
                onClick={() => setArchiveFilter("active")}
              >
                Active
              </button>
              <button
                className="chip"
                type="button"
                aria-pressed={archiveFilter === "archived"}
                onClick={() => setArchiveFilter("archived")}
              >
                Archived
              </button>
            </div>
          )}
          {/* Discussion after Archived: just the chat icon, in the "…"
              menu's grey, the rail's icon size (direct instruction; the
              icon supplied, "chatting" from the Noun Project). */}
          {confirmedStaff && project && (
            <button
              type="button"
              className="pjlink"
              aria-label="Discussion"
              title="Discussion"
              onClick={() => setPanel("discussion")}
            >
              <svg viewBox="0 0 1200 1200" aria-hidden="true">
                <path d="m1089.8 75.918h-979.59c-53.879 0-97.961 44.082-97.961 97.961v646.53c0 53.879 44.082 97.961 97.961 97.961h68.57v183.67c0 9.7969 4.8984 17.145 12.246 22.039 2.4492 2.4492 7.3477 2.4492 12.246 2.4492s9.7969-2.4492 14.695-4.8984l276.73-203.27h597.55c53.879 0 97.961-44.082 97.961-97.961l-0.003906-646.53c-2.4492-53.879-46.531-97.961-100.41-97.961zm48.98 742.04c0 26.938-22.039 48.98-48.98 48.98l-604.9-0.003906c-4.8984 0-9.7969 2.4492-14.695 4.8984l-244.9 181.22v-159.18c0-14.695-9.7969-24.488-24.488-24.488h-90.613c-26.938 0-48.98-22.039-48.98-48.98v-646.53c0-26.938 22.039-48.98 48.98-48.98h982.04c26.938 0 48.98 22.039 48.98 48.98v644.08z" />
                <path d="m960 325.71h-720c-14.695 0-24.488 9.7969-24.488 24.488 0 14.695 9.7969 24.488 24.488 24.488h720c14.695 0 24.488-9.7969 24.488-24.488s-9.793-24.488-24.488-24.488z" />
                <path d="m960 470.2h-720c-14.695 0-24.488 9.7969-24.488 24.488 0 14.695 9.7969 24.488 24.488 24.488h720c14.695 0 24.488-9.7969 24.488-24.488s-9.793-24.488-24.488-24.488z" />
                <path d="m960 617.14h-720c-14.695 0-24.488 9.7969-24.488 24.488 0 14.695 9.7969 24.488 24.488 24.488h720c14.695 0 24.488-9.7969 24.488-24.488 0-14.695-9.793-24.488-24.488-24.488z" />
              </svg>
            </button>
          )}
          {/* The project's own menu (direct instruction, after monday.com's
              board options): its Activity Log and Settings. The team only. */}
          {confirmedStaff && project && (
            <RowActionsMenu
              title="Project options"
              items={[
                { label: "Activity Log", onClick: () => setPanel("activity") },
                { label: "Settings", onClick: () => setSettingsOpen(true) },
              ]}
            />
          )}
          {confirmedStaff && showNewBrief && <span className="toolsep" />}
          {showNewBrief && project && (
            <SplitButton
              label="+ New Post"
              onClick={() => setNewBriefOpen(true)}
              menuLabel="How to add it"
              items={[
                { label: "Window", hint: "The full form", onClick: () => setNewBriefOpen(true) },
                {
                  label: "Row",
                  hint: "Type it straight into the table",
                  onClick: () => {
                    setArchiveFilter("active");
                    setDraftRowOpen(true);
                  },
                },
              ]}
            />
          )}
        </div>
      </div>

      {movedNotice && (
        <p className="sub" role="status" style={{ margin: "0 0 4px" }}>
          {movedNotice}
        </p>
      )}

      {isError && (
        <div className="empty">
          <b>Couldn&rsquo;t load this project</b>
          <span>{errorMessage(error, "Unknown error")}</span>
        </div>
      )}

      {!isError && !isLoading && project?.delivery === "continuous" && archiveFilter === "active" && activeCreatives.length === 0 && !draftRowOpen && (
        <div className="empty">
          <b>No creatives yet</b>
          <span>
            {showNewBrief
              ? "Use New Post above to add the first one."
              : "Your team hasn't briefed anything here yet."}
          </span>
        </div>
      )}

      {!isError && !isLoading && project?.delivery === "continuous" && archiveFilter === "archived" && visibleCreatives.length === 0 && (
        <div className="empty">
          <b>No archived creatives</b>
          <span>Nothing has been deleted yet.</span>
        </div>
      )}

      {!isError && creatives && project?.delivery === "scheduled" && (
        <ProjectCalendarTable
          key={calendarFocusDate ?? "default"}
          projectId={id}
          projectName={project.name}
          creatives={visibleCreatives}
          archiveMode={archiveFilter}
          customColumns={columns}
          onCxSave={(creativeId, key, value) =>
            updateCx.mutate({ creativeId, key, value })
          }
          cxReadOnly={!confirmedStaff}
          isStaff={confirmedStaff}
          initialFocusDate={calendarFocusDate}
          draftRow={draftRow}
        />
      )}

      {!isError && creatives && project?.delivery === "continuous" && (visibleCreatives.length > 0 || draftRowOpen) && (
        <ContinuousCalendarTable
          key={calendarFocusDate ?? "default"}
          projectId={id}
          projectName={project.name}
          creatives={visibleCreatives}
          archiveMode={archiveFilter}
          customColumns={columns}
          onCxSave={(creativeId, key, value) =>
            updateCx.mutate({ creativeId, key, value })
          }
          cxReadOnly={!confirmedStaff}
          isStaff={confirmedStaff}
          initialFocusDate={calendarFocusDate}
          draftRow={draftRow}
        />
      )}

      <ProjectPanel projectId={id} projectName={project?.name ?? "Project"} view={panel} onClose={() => setPanel(null)} />

      {settingsOpen && project && (
        <ProjectSettings
          projectId={id}
          clientId={project.client_id}
          onClose={() => setSettingsOpen(false)}
          onDeleted={() => router.push(`/clients/${project.client_id}`)}
          onMoved={(notice) => {
            setSettingsOpen(false);
            setMovedNotice(notice);
          }}
        />
      )}

      {newBriefOpen && project && (
        <CreativeModal
          mode="create"
          projectId={id}
          clientId={project.client_id}
          delivery={project.delivery}
          onClose={() => setNewBriefOpen(false)}
          onCreated={(scheduledAt, dueOn) => {
            if (scheduledAt) setCalendarFocusDate(scheduledAt);
            if (dueOn) setCalendarFocusDate(dueOn);
          }}
        />
      )}
    </div>
  );
}
