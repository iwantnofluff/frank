"use client";

import { useRef, useState } from "react";
import {
  useAddStatus,
  useDeleteStatus,
  useRenameStatus,
  useSetStatusHides,
  useStatusList,
  useStatusPostCount,
  useSwapStatuses,
  type StageStatus,
  type StatusList,
} from "@/hooks/use-stage-statuses";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { errorMessage } from "@/lib/errors";
import { STAGE, STAGE_COUNT, stageLabel } from "@/lib/stage-labels";

// Every stage (phase151), in order.
const STAGES = Array.from({ length: STAGE_COUNT }, (_, i) => ({ stage: i + 1, label: stageLabel(i + 1, "scheduled") }));

// A status's name, editable in place: saved when left or on Enter, put
// back on Escape (which mustn't then save on the blur that follows).
function StatusName({ status, onRename }: { status: StageStatus; onRename: (label: string) => void }) {
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

// A list of statuses, the agency's or a client's own (phase151, was each
// project's, phase123): the steps a post moves through within each stage.
// Owners and Admins add, rename, reorder and remove them; the team sees
// them. Only Concept, In Production and Internal Review can hide their
// posts, as a client never sees a post in those.
export function StatusListEditor({ list, canManage }: { list: StatusList | undefined; canManage: boolean }) {
  const { data: statuses, isLoading, isError } = useStatusList(list);
  const add = useAddStatus(list);
  const rename = useRenameStatus();
  const swap = useSwapStatuses();
  const remove = useDeleteStatus();
  const hides = useSetStatusHides();
  const [adding, setAdding] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [removing, setRemoving] = useState<StageStatus | null>(null);
  const { data: onIt } = useStatusPostCount(removing?.id ?? null);
  const busy = add.isPending || rename.isPending || swap.isPending || remove.isPending || hides.isPending;
  const error = add.error ?? rename.error ?? swap.error ?? hides.error;

  return (
    <>
      {isError && <p className="autherr">Couldn&rsquo;t load the statuses</p>}
      {error && <p className="autherr">{errorMessage(error, "Couldn't save that")}</p>}
      {!isLoading &&
        statuses &&
        STAGES.map(({ stage, label }) => {
          const list = statuses.filter((s) => s.stage === stage);
          return (
            <section className="panel" key={stage} role="group" aria-label={label}>
              <div className="panel-h">
                <b>
                  {stage}. {label}
                </b>
              </div>
              <div className="ps-body">
              {list.map((s, i) => (
                <div className="ps-row" key={s.id}>
                  {canManage ? (
                    <StatusName status={s} onRename={(next) => rename.mutate({ id: s.id, label: next })} />
                  ) : (
                    <span className="ps-label">
                      {s.label}
                      {s.hides_post && <span className="ps-hidden-tag">Hides its posts</span>}
                    </span>
                  )}
                  {canManage && (
                    <span className="ps-acts">
                      {/* Its posts hidden from the lists and counts (phase143,
                          direct instruction: a Cancelled post shouldn't show). */}
                      {stage <= STAGE.internal && (
                        <label className="ps-hide">
                          <input
                            type="checkbox"
                            checked={s.hides_post}
                            disabled={busy}
                            onChange={(e) => hides.mutate({ id: s.id, hides: e.target.checked })}
                          />
                          Hides its posts
                        </label>
                      )}
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
            </section>
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
                : `${onIt} post${onIt === 1 ? " is" : "s are"} on it, and will move to the first status left in ${stageLabel(
                    removing.stage,
                    "scheduled",
                  )}.`
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
