"use client";

import { use, useMemo, useState } from "react";
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
            {project && project.delivery === "scheduled"
              ? `${project.clients?.name ?? "—"} — ${project.name}`
              : (project?.name ?? "Project")}
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
