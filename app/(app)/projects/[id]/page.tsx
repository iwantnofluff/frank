"use client";

import { use, useState } from "react";
import { useProject } from "@/hooks/use-project";
import { useCreatives } from "@/hooks/use-creatives";
import { useCustomColumns } from "@/hooks/use-custom-columns";
import { useUpdateCreativeCx } from "@/hooks/use-update-creative-cx";
import { useIsStaff } from "@/hooks/use-is-staff";
import { errorMessage } from "@/lib/errors";
import { CreativeModal } from "@/components/creative-review/CreativeModal";
import { ProjectCalendarTable } from "@/components/project/ProjectCalendarTable";
import { ContinuousCalendarTable } from "@/components/project/ContinuousCalendarTable";

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
  const { data: customColumns } = useCustomColumns(id);
  const updateCx = useUpdateCreativeCx(id);
  const { isStaff, isPending: isStaffPending } = useIsStaff();
  const [newBriefOpen, setNewBriefOpen] = useState(false);
  const [calendarFocusDate, setCalendarFocusDate] = useState<string | null>(null);

  const isLoading = projectLoading || creativesLoading;
  const columns = customColumns ?? [];
  // Fails closed like every other isStaff gate this session: hidden/
  // read-only while still resolving, not shown/editable by default.
  const confirmedStaff = isStaff && !isStaffPending;
  // Entry point lives here rather than the topbar, same as the prototype's
  // own #briefWrap (only shown on the calendar view, not as a global nav
  // item) — docs/parity-gaps.md.
  const showNewBrief = confirmedStaff;

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
                  · {project.delivery === "scheduled" ? "Scheduled" : "Continuous"}
                </>
              )}
            </p>
          )}
        </div>
        {showNewBrief && project && (
          <button
            type="button"
            className="btn primary"
            onClick={() => setNewBriefOpen(true)}
          >
            + New Brief
          </button>
        )}
      </div>

      {isError && (
        <div className="empty">
          <b>Couldn&rsquo;t load this project</b>
          <span>{errorMessage(error, "Unknown error")}</span>
        </div>
      )}

      {!isError && !isLoading && project?.delivery === "continuous" && creatives?.length === 0 && (
        <div className="empty">
          <b>No creatives yet</b>
          <span>
            {showNewBrief
              ? "Use New Brief above to add the first one."
              : "Your team hasn't briefed anything here yet."}
          </span>
        </div>
      )}

      {!isError && creatives && project?.delivery === "scheduled" && (
        <ProjectCalendarTable
          key={calendarFocusDate ?? "default"}
          projectName={project.name}
          creatives={creatives}
          customColumns={columns}
          onCxSave={(creativeId, key, value) =>
            updateCx.mutate({ creativeId, key, value })
          }
          cxReadOnly={!confirmedStaff}
          isStaff={confirmedStaff}
          initialFocusDate={calendarFocusDate}
        />
      )}

      {!isError && creatives && project?.delivery === "continuous" && creatives.length > 0 && (
        <ContinuousCalendarTable
          key={calendarFocusDate ?? "default"}
          projectName={project.name}
          creatives={creatives}
          customColumns={columns}
          onCxSave={(creativeId, key, value) =>
            updateCx.mutate({ creativeId, key, value })
          }
          cxReadOnly={!confirmedStaff}
          isStaff={confirmedStaff}
          initialFocusDate={calendarFocusDate}
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
