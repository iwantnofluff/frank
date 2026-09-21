"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useProject } from "@/hooks/use-project";
import { useCreatives, type CreativeListRow } from "@/hooks/use-creatives";
import { useCustomColumns, type CustomColumnRow } from "@/hooks/use-custom-columns";
import { useUpdateCreativeCx } from "@/hooks/use-update-creative-cx";
import { useIsStaff } from "@/hooks/use-is-staff";
import { stageLabel } from "@/lib/stage-labels";
import { CxCell } from "@/components/project/CxCell";
import { AddColumnForm } from "@/components/project/AddColumnForm";
import { NewBriefModal } from "@/components/project/NewBriefModal";

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

const BASE_TEMPLATE: Record<"scheduled" | "continuous", string> = {
  scheduled: "1fr 140px 1fr 160px 140px",
  continuous: "1fr 120px 1fr 100px 100px 140px",
};

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

  const isLoading = projectLoading || creativesLoading;
  const columns = customColumns ?? [];
  // Fails closed like every other isStaff gate this session: hidden/
  // read-only while still resolving, not shown/editable by default.
  const confirmedStaff = isStaff && !isStaffPending;
  // Entry point lives here rather than the topbar (there's nowhere else
  // for it to go until calendar exists — docs/parity-gaps.md).
  const showNewBrief = confirmedStaff;

  function gridTemplate(delivery: "scheduled" | "continuous") {
    const extra = columns.length ? ` repeat(${columns.length}, 140px)` : "";
    return `${BASE_TEMPLATE[delivery]}${extra}`;
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
          <h1 className="h1">{project?.name ?? "Project"}</h1>
          <p className="sub">
            {project?.clients?.name ?? "—"}
            {project && (
              <>
                {" "}
                · {project.delivery === "scheduled" ? "Scheduled" : "Continuous"}
              </>
            )}
          </p>
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
          <span>{error instanceof Error ? error.message : "Unknown error"}</span>
        </div>
      )}

      {!isError && !isLoading && creatives?.length === 0 && (
        <div className="empty">
          <b>No creatives yet</b>
          <span>
            {showNewBrief
              ? "Use New Brief above to add the first one."
              : "Your team hasn't briefed anything here yet."}
          </span>
        </div>
      )}

      {!isError && creatives && creatives.length > 0 && project && (
        <div className="ptable">
          {project.delivery === "scheduled" ? (
            <>
              <div
                className="prow head"
                style={{ gridTemplateColumns: gridTemplate("scheduled") }}
              >
                <div>Creative</div>
                <div>Format</div>
                <div>Platforms</div>
                <div>Scheduled</div>
                <div>Stage</div>
                {columns.map((col) => (
                  <div key={col.id}>{col.label}</div>
                ))}
              </div>
              {creatives.map((c) => (
                <div
                  className="prow"
                  key={c.id}
                  style={{ gridTemplateColumns: gridTemplate("scheduled") }}
                >
                  <Link href={`/creatives/${c.id}`} className="pname">
                    {c.name}
                  </Link>
                  <div>{c.format}</div>
                  <div>{c.platforms?.join(", ") || "—"}</div>
                  <div>{formatDateTime(c.scheduled_at)}</div>
                  <div>
                    <span className="tag blue">
                      {stageLabel(c.stage, "scheduled")}
                    </span>
                  </div>
                  {renderCustomCells(c)}
                </div>
              ))}
            </>
          ) : (
            <>
              <div
                className="prow head"
                style={{ gridTemplateColumns: gridTemplate("continuous") }}
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
                  style={{ gridTemplateColumns: gridTemplate("continuous") }}
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
            </>
          )}
          {confirmedStaff && (
            <AddColumnForm projectId={id} nextPosition={columns.length} />
          )}
        </div>
      )}

      {newBriefOpen && project && (
        <NewBriefModal
          projectId={id}
          delivery={project.delivery}
          onClose={() => setNewBriefOpen(false)}
        />
      )}
    </div>
  );
}
