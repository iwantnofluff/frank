"use client";

import { useState } from "react";
import { PillMenu, type PillMenuItem } from "@/components/project/PillMenu";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useApproveConcept } from "@/hooks/use-approve-concept";
import { useSetCreativeStage, type ProjectStatus } from "@/hooks/use-project-statuses";
import { statusOptions } from "@/lib/project-statuses";
import { STAGE_COUNT, exceptionLabel, stageLabel, type Exception } from "@/lib/stage-labels";

// The table's Status pill for the team (direct instruction): every stage,
// each followed by its statuses (3. Internal Review, 3a. Internal QC
// (Copy)…), and a post moves to whichever is picked. A post still in
// Concept moves on once its Concept is approved: a window says so first,
// with Approve Concept.
export function StagePillMenu({
  post,
  statuses,
  delivery,
  color,
}: {
  post: { id: string; name: string; stage: number; status_id: string | null; exception: Exception | null };
  statuses: ProjectStatus[] | undefined;
  delivery: "scheduled" | "continuous";
  color: string;
}) {
  const move = useSetCreativeStage();
  const approve = useApproveConcept();
  const [waiting, setWaiting] = useState<{ stage: number; statusId: string | null; text: string } | null>(null);

  const items: PillMenuItem[] = [];
  for (let stage = 1; stage <= STAGE_COUNT; stage++) {
    items.push({ key: `${stage}`, text: `${stage}. ${stageLabel(stage, delivery)}` });
    for (const o of statusOptions(statuses, stage)) items.push({ key: `${stage}:${o.id}`, text: o.text, indent: true });
  }
  const value = post.status_id ? `${post.stage}:${post.status_id}` : `${post.stage}`;
  const shown = items.find((it) => it.key === value)?.text ?? `${post.stage}. ${stageLabel(post.stage, delivery)}`;

  const go = (key: string) => {
    const [s, statusId] = key.split(":");
    const stage = Number(s);
    const text = items.find((it) => it.key === key)?.text ?? "";
    if (post.stage === 1 && stage > 1) {
      approve.reset();
      move.reset();
      setWaiting({ stage, statusId: statusId ?? null, text });
      return;
    }
    move.mutate({ creativeId: post.id, stage, statusId: statusId ?? null });
  };

  return (
    <>
      <PillMenu
        label={`Status of ${post.name}`}
        className="stg stg-pick"
        style={{ backgroundColor: color }}
        items={items}
        value={value}
        onPick={go}
        disabled={move.isPending || approve.isPending}
      >
        {post.exception ? exceptionLabel(post.exception) : shown}
      </PillMenu>
      {move.error && !waiting && <span className="autherr stg-err">{(move.error as Error).message}</span>}
      {waiting && (
        <ConfirmDialog
          title="Approve the Concept first?"
          message={`this post is still in Concept, and its Concept needs approving before it moves on. Approve Concept records it in your name, then moves it to ${waiting.text}.`}
          confirmLabel="Approve Concept"
          pendingLabel="Approving…"
          tone="primary"
          isPending={approve.isPending || move.isPending}
          error={approve.error ?? move.error}
          errorFallback="Couldn't approve it"
          onConfirm={async () => {
            try {
              await approve.mutateAsync(post.id);
              await move.mutateAsync({ creativeId: post.id, stage: waiting.stage, statusId: waiting.statusId });
              setWaiting(null);
            } catch {
              // Shown in the window.
            }
          }}
          onClose={() => setWaiting(null)}
        />
      )}
    </>
  );
}
