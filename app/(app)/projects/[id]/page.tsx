"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useProject } from "@/hooks/use-project";
import { useCreatives, type CreativeListRow } from "@/hooks/use-creatives";
import { useCustomColumns, type CustomColumnRow } from "@/hooks/use-custom-columns";
import { useUpdateCreativeCx } from "@/hooks/use-update-creative-cx";
import { useIsStaff } from "@/hooks/use-is-staff";
import { stageLabel } from "@/lib/stage-labels";
import { errorMessage } from "@/lib/errors";
import { CxCell } from "@/components/project/CxCell";
import { AddColumnForm } from "@/components/project/AddColumnForm";
import { CreativeModal } from "@/components/creative-review/CreativeModal";
import { ProjectCalendarTable } from "@/components/project/ProjectCalendarTable";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

// Continuous-delivery projects only — scheduled-delivery uses
// ProjectCalendarTable's own <table> instead of this CSS-grid .ptable.
const CONTINUOUS_TEMPLATE = "1fr 120px 1fr 100px 100px 140px";

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

  function continuousGridTemplate() {
    const extra = columns.length ? ` repeat(${columns.length}, 140px)` : "";
    return `${CONTINUOUS_TEMPLATE}${extra}`;
  }

  function renderCustomCells(creative: CreativeListRow) {
    return columns.map((col: CustomColumnRow) => (
      <CxCell
        key={col.id}
        column={col}
        value={creative.cx?.[col.key] ?? null}
        onSave={(value) =>
          updateCx.mutate({ creativeId: creative.id, key: col.key, value })
        }
        readOnly={!confirmedStaff}
      />
    ));
  }

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

      {!isError && creatives && creatives.length > 0 && project?.delivery === "continuous" && (
        <div className="ptable">
          <div
            className="prow head"
            style={{ gridTemplateColumns: continuousGridTemplate() }}
          >
            <div>Creative</div>
            <div>Format</div>
            <div>Destination</div>
            <div>Added</div>
            <div>Due</div>
            <div>Stage</div>
            {columns.map((col) => (
              <div key={col.id}>{col.label}</div>
            ))}
          </div>
          {creatives.map((c) => (
            <div
              className="prow"
              key={c.id}
              style={{ gridTemplateColumns: continuousGridTemplate() }}
            >
              <Link href={`/creatives/${c.id}`} className="pname">
                {c.name}
              </Link>
              <div>{c.format}</div>
              <div>{c.destination || "—"}</div>
              <div>{formatDate(c.added_on)}</div>
              <div>{formatDate(c.due_on)}</div>
              <div>
                <span className="tag blue">
                  {stageLabel(c.stage, "continuous")}
                </span>
              </div>
              {renderCustomCells(c)}
            </div>
          ))}
          {confirmedStaff && (
            <AddColumnForm projectId={id} nextPosition={columns.length} />
          )}
        </div>
      )}

      {newBriefOpen && project && (
        <CreativeModal
          mode="create"
          projectId={id}
          clientId={project.client_id}
          delivery={project.delivery}
          onClose={() => setNewBriefOpen(false)}
          onCreated={(scheduledAt) => {
            if (scheduledAt) setCalendarFocusDate(scheduledAt);
          }}
        />
      )}
    </div>
  );
}
