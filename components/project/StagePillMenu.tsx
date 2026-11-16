"use client";

import { useState } from "react";
import { PillMenu, type PillMenuItem } from "@/components/project/PillMenu";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useApproveConcept } from "@/hooks/use-approve-concept";
import { useSetCreativeStage, type StageStatus } from "@/hooks/use-stage-statuses";
import { statusOptions } from "@/lib/project-statuses";
import { STAGE_COUNT, exceptionLabel, stageLabel, type Exception } from "@/lib/stage-labels";

// The table's Status pill for the team (direct instruction): every stage,
// each followed by its statuses (3. Internal Review, 3a. Internal QC
// (Copy)…), and a post moves to whichever is picked. A post still in
// Concept moves on once its Concept is approved: a window says so first,
// with Approve Concept.
// Moving a post to a stage, or a status within one (key "4" or "4:<id>"),
// as the table's Status pill does: a post still in Concept asks to approve
// its Concept first, in a window this returns to draw. Also the post
// page's stages (direct instruction).
export function useStagePick(post: { id: string; stage: number } | null | undefined) {
  const move = useSetCreativeStage();
  const approve = useApproveConcept();
  const [waiting, setWaiting] = useState<{ stage: number; statusId: string | null; text: string } | null>(null);

  const go = (key: string, text: string) => {
    if (!post) return;
    const [s, statusId] = key.split(":");
    const stage = Number(s);
    if (post.stage === 1 && stage > 1) {
      approve.reset();
      move.reset();
      setWaiting({ stage, statusId: statusId ?? null, text });
      return;
    }
    move.mutate({ creativeId: post.id, stage, statusId: statusId ?? null });
  };

  const dialog =
    waiting && post ? (
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
    ) : null;

  return { go, dialog, pending: move.isPending || approve.isPending, error: waiting ? null : move.error };
}

export function StagePillMenu({
  post,
  statuses,
  delivery,
  color,
}: {
  post: { id: string; name: string; stage: number; status_id: string | null; exception: Exception | null };
  statuses: StageStatus[] | undefined;
  delivery: "scheduled" | "continuous";
  color: string;
}) {
  const pickStage = useStagePick(post);

  const items: PillMenuItem[] = [];
  for (let stage = 1; stage <= STAGE_COUNT; stage++) {
    items.push({ key: `${stage}`, text: `${stage}. ${stageLabel(stage, delivery)}` });
    for (const o of statusOptions(statuses, stage)) items.push({ key: `${stage}:${o.id}`, text: o.text, indent: true });
  }
  const value = post.status_id ? `${post.stage}:${post.status_id}` : `${post.stage}`;
  const shown = items.find((it) => it.key === value)?.text ?? `${post.stage}. ${stageLabel(post.stage, delivery)}`;

  return (
    <>
      <PillMenu
        label={`Status of ${post.name}`}
        className="stg stg-pick"
        style={{ backgroundColor: color }}
        items={items}
        value={value}
        onPick={(key) => pickStage.go(key, items.find((it) => it.key === key)?.text ?? "")}
        disabled={pickStage.pending}
      >
        {post.exception ? exceptionLabel(post.exception) : shown}
      </PillMenu>
      {pickStage.error && <span className="autherr stg-err">{(pickStage.error as Error).message}</span>}
      {pickStage.dialog}
    </>
  );
}
