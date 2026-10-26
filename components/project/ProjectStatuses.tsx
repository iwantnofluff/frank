"use client";

import { useRef, useState } from "react";
import {
  useAddProjectStatus,
  useDeleteProjectStatus,
  useProjectStatuses,
  useRenameProjectStatus,
  useStatusPostCount,
  useSwapProjectStatuses,
  type ProjectStatus,
} from "@/hooks/use-project-statuses";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { errorMessage } from "@/lib/errors";
import { STAGE } from "@/lib/stage-labels";

const STAGES: { stage: 2 | 3; label: string }[] = [
  { stage: STAGE.production, label: "In Production" },
  { stage: STAGE.internal, label: "Internal Review" },
];

// A status's name, editable in place: saved when left or on Enter, put
// back on Escape (which mustn't then save on the blur that follows).
function StatusName({ status, onRename }: { status: ProjectStatus; onRename: (label: string) => void }) {
  const [draft, setDraft] = useState(status.label);
  const [was, setWas] = useState(status.label);
  const cancelled = useRef(false);
  if (status.label !== was) {
    setWas(status.label);
    setDraft(status.label);
  }
  return (
    <input
      className="bin one ps-name"
      aria-label={`Name of ${status.label}`}
      value={draft}
      maxLength={40}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (cancelled.current) {
          cancelled.current = false;
          return;
        }
        const next = draft.trim();
        if (!next) setDraft(status.label);
        else if (next !== status.label) onRename(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          // Puts the name back without closing the Settings window too.
          e.stopPropagation();
          cancelled.current = true;
          setDraft(status.label);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

// Project Settings → Statuses (phase123, direct instruction): the steps a
// post moves through within In Production and Internal Review. Owners and
// Admins add, rename, reorder and remove them; the team sees them.
export function ProjectStatuses({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const { data: statuses, isLoading, isError } = useProjectStatuses(projectId);
  const add = useAddProjectStatus(projectId);
  const rename = useRenameProjectStatus(projectId);
  const swap = useSwapProjectStatuses(projectId);
  const remove = useDeleteProjectStatus(projectId);
  const [adding, setAdding] = useState<2 | 3 | null>(null);
  const [draft, setDraft] = useState("");
  const [removing, setRemoving] = useState<ProjectStatus | null>(null);
  const { data: onIt } = useStatusPostCount(removing?.id ?? null);
  const busy = add.isPending || rename.isPending || swap.isPending || remove.isPending;
  const error = add.error ?? rename.error ?? swap.error;

  return (
    <>
      <div className="msection-h">Statuses</div>
      <p className="msection-d">
        The steps a post moves through within In Production and Internal Review, for your team only. A post takes the first
        when it gets to that stage.{canManage ? " Changes save as they're made." : " Owners and Admins change them."}
      </p>
      {isError && <p className="autherr">Couldn&rsquo;t load the statuses</p>}
      {error && <p className="autherr">{errorMessage(error, "Couldn't save that")}</p>}
      {!isLoading &&
        statuses &&
        STAGES.map(({ stage, label }) => {
          const list = statuses.filter((s) => s.stage === stage);
          return (
            <div className="ps-stage" key={stage} role="group" aria-label={label}>
              <div className="ps-stage-h">{label}</div>
              {list.map((s, i) => (
                <div className="ps-row" key={s.id}>
                  {canManage ? (
                    <StatusName status={s} onRename={(next) => rename.mutate({ id: s.id, label: next })} />
                  ) : (
                    <span className="ps-label">{s.label}</span>
                  )}
                  {canManage && (
                    <span className="ps-acts">
                      <button
                        type="button"
                        className="ps-btn"
                        aria-label={`Move ${s.label} up`}
                        disabled={i === 0 || busy}
                        onClick={() => swap.mutate({ a: s, b: list[i - 1] })}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="ps-btn"
                        aria-label={`Move ${s.label} down`}
                        disabled={i === list.length - 1 || busy}
                        onClick={() => swap.mutate({ a: s, b: list[i + 1] })}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="pr-link"
                        aria-label={`Remove ${s.label}`}
                        disabled={busy}
                        onClick={() => {
                          remove.reset();
                          setRemoving(s);
                        }}
                      >
                        Remove
                      </button>
                    </span>
                  )}
                </div>
              ))}
              {!list.length && <p className="ps-none">No statuses: posts here show the stage alone.</p>}
              {canManage &&
                (adding === stage ? (
                  <div className="ps-row">
                    <input
                      id={`ps-new-${stage}`}
                      className="bin one ps-name"
                      autoFocus
                      maxLength={40}
                      aria-label={`New ${label} status`}
                      placeholder="e.g. Waiting on legal"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.stopPropagation();
                          setAdding(null);
                        }
                        if (e.key === "Enter" && draft.trim())
                          add.mutate(
                            { stage, label: draft.trim(), position: (list.at(-1)?.position ?? -1) + 1 },
                            { onSuccess: () => setAdding(null) },
                          );
                      }}
                    />
                    <span className="ps-acts">
                      <button
                        type="button"
                        className="btn primary sm"
                        disabled={!draft.trim() || busy}
                        onClick={() =>
                          add.mutate(
                            { stage, label: draft.trim(), position: (list.at(-1)?.position ?? -1) + 1 },
                            { onSuccess: () => setAdding(null) },
                          )
                        }
                      >
                        {add.isPending ? "Adding…" : "Add"}
                      </button>
                      <button type="button" className="btn sm" onClick={() => setAdding(null)}>
                        Cancel
                      </button>
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="fbtn ps-add"
                    onClick={() => {
                      add.reset();
                      setDraft("");
                      setAdding(stage);
                    }}
                  >
                    Add Status
                  </button>
                ))}
            </div>
          );
        })}

      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.label}?`}
          message={
            onIt === undefined
              ? "checking which posts are on it…"
              : onIt === 0
                ? "no post is on it, so nothing else changes."
                : `${onIt} post${onIt === 1 ? " is" : "s are"} on it, and will move to the first status left in ${
                    removing.stage === STAGE.production ? "In Production" : "Internal Review"
                  }.`
          }
          confirmLabel="Remove"
          pendingLabel="Removing…"
          isPending={remove.isPending}
          error={remove.error}
          errorFallback="Couldn't remove it"
          tone="danger"
          onConfirm={() => remove.mutate(removing.id, { onSuccess: () => setRemoving(null) })}
          onClose={() => setRemoving(null)}
        />
      )}
    </>
  );
}
