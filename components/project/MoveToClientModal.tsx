"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useClients } from "@/hooks/use-clients";
import { useMoveProjectToClient } from "@/hooks/use-move-project-to-client";
import { errorMessage } from "@/lib/errors";

// Same radio-list shape as MoveToFolderModal. Only other, active clients
// are offered — move_project_to_client refuses archived ones anyway.
export function MoveToClientModal({
  projectId,
  projectName,
  fromClientId,
  onClose,
  onMoved,
}: {
  projectId: string;
  projectName: string;
  fromClientId: string;
  onClose: () => void;
  onMoved: (clientName: string) => void;
}) {
  const { data: clients } = useClients();
  const move = useMoveProjectToClient();
  const targets = (clients ?? []).filter((c) => !c.archived_at && c.id !== fromClientId);
  const [selected, setSelected] = useState<string | null>(null);

  async function handleMove() {
    if (!selected) return;
    await move.mutateAsync({ projectId, fromClientId, toClientId: selected });
    onMoved(targets.find((c) => c.id === selected)?.name ?? "the new client");
  }

  return (
    <Modal hideCloseButton
      title="Move to Client"
      ariaLabel={`Move ${projectName} to another client`}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <div className="grow" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!selected || move.isPending}
            onClick={() => handleMove().catch(() => {})}
          >
            {move.isPending ? "Moving…" : "Move"}
          </button>
        </>
      }
    >
      <p className="sub" style={{ marginBottom: 10 }}>
        Which client should &ldquo;{projectName}&rdquo; belong to? It goes in at the top level, not
        in a folder, and any Share for Review links already sent for it stop working.
      </p>
      {targets.length === 0 ? (
        <p className="msection-empty">There&rsquo;s no other active client to move it to.</p>
      ) : (
        <div className="radios" role="radiogroup" aria-label="Client">
          {targets.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              className="radio"
              aria-checked={selected === c.id}
              onClick={() => setSelected(c.id)}
            >
              <span className="rd" />
              <span>
                <b>{c.name}</b>
              </span>
            </button>
          ))}
        </div>
      )}
      {move.error && <p className="autherr">{errorMessage(move.error, "Couldn't move this project")}</p>}
    </Modal>
  );
}
