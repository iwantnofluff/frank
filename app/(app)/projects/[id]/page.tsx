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
          {/* Discussion as a link after Archived, with a chat icon (direct
              instruction; the icon supplied, "chat" from the Noun Project). */}
          {confirmedStaff && project && (
            <button type="button" className="pjlink" onClick={() => setPanel("discussion")}>
              <svg viewBox="0 0 1200 1200" aria-hidden="true">
                <path d="m97.879 73.777c-53.969 0-97.879 43.91-97.879 97.883v587.18c0 53.973 43.91 97.883 97.883 97.883h57.219v241.59c0 11.289 6.8008 21.461 17.227 25.781 3.4531 1.4297 7.0742 2.125 10.672 2.125 7.2617 0 14.406-2.8398 19.742-8.1758l261.32-261.32h638.05c53.973 0 97.879-43.91 97.879-97.883v-587.18c0.003906-53.973-43.906-97.883-97.875-97.883h-1004.2zm0 55.816h1004.2c23.199 0 42.074 18.871 42.074 42.07v587.18c0 23.195-18.871 42.074-42.07 42.074h-649.63c-7.2188 0-13.781 2.7617-18.73 7.2617-0.042969 0.035156-0.09375 0.097656-0.13672 0.13281-0.33984 0.3125-0.6875 0.61328-1.0117 0.94141l-221.7 221.7v-202.12c0-0.97266-0.046875-1.832-0.14844-2.5898-1.3086-14.195-13.238-25.316-27.777-25.316h-85.113c-23.199 0-42.07-18.875-42.07-42.074v-587.18c0-23.199 18.871-42.07 42.07-42.07zm147.25 147.99c-15.414 0-27.906 12.496-27.906 27.906 0 15.41 12.492 27.902 27.906 27.902h162.65c15.414 0 27.906-12.492 27.906-27.902 0-15.41-12.496-27.906-27.906-27.906zm325.59 0c-15.414 0-27.906 12.496-27.906 27.906 0 15.41 12.492 27.902 27.906 27.902h384.16c15.41 0 27.906-12.492 27.906-27.902 0-15.414-12.496-27.906-27.906-27.906zm-325.59 159.76c-15.414 0-27.906 12.496-27.906 27.906s12.492 27.906 27.906 27.906h452.7c15.41 0 27.906-12.492 27.906-27.906 0-15.406-12.496-27.906-27.906-27.906zm608.73 0c-15.41 0-27.906 12.496-27.906 27.906 0 15.414 12.496 27.906 27.906 27.906h101.02c15.41 0 27.906-12.492 27.906-27.906s-12.496-27.906-27.906-27.906zm-608.73 159.76c-15.414 0-27.906 12.492-27.906 27.906 0 15.41 12.492 27.902 27.906 27.902h252.7c15.414 0 27.906-12.492 27.906-27.902 0-15.414-12.492-27.906-27.906-27.906zm400.99 0c-15.41 0-27.906 12.492-27.906 27.906 0 15.41 12.496 27.902 27.906 27.902h308.76c15.41 0 27.906-12.492 27.906-27.902 0-15.414-12.496-27.906-27.906-27.906z" />
              </svg>
              Discussion
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
