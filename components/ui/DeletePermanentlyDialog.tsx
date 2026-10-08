"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useDeleteCounts, useDeletePermanently, type DeleteKind } from "@/hooks/use-delete-permanently";
import { errorMessage } from "@/lib/errors";

// Deleting an archived client or project for good (direct instruction,
// phase74): what it takes, listed, and Delete only once its name is typed
// exactly (decided directly), so it can't happen by accident.
export function DeletePermanentlyDialog({
  kind,
  id,
  name,
  onClose,
  onDeleted,
}: {
  kind: DeleteKind;
  id: string;
  name: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { data: counts } = useDeleteCounts(kind, id);
  const del = useDeletePermanently();
  const [typed, setTyped] = useState("");
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const what = counts
    ? [
        ...(kind === "client" ? [plural(counts.projects, "project")] : []),
        plural(counts.posts, "post"),
        plural(counts.comments, "comment"),
        plural(counts.files, "file"),
        ...(kind === "client" ? ["its knowledge, client team list, preferences and Instagram connection"] : []),
        ...(kind === "client" && counts.people
          ? [`${plural(counts.people, "person", "people")} at the client ${counts.people === 1 ? "loses" : "lose"} access (their logins stay)`]
          : []),
      ]
    : [];
  const matches = typed.trim() === name.trim();

  return (
    <Modal hideCloseButton title={`Delete ${name} for good?`} size="sm" onClose={onClose}>
      <p className="sub">
        This {kind} and everything in it will be deleted, and can&apos;t be brought back:
      </p>
      {counts ? (
        <ul className="confirm-list">
          {what.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : (
        <p className="sub">Frank is working…</p>
      )}
      <label className="authfield" style={{ marginTop: 12 }}>
        <span>Type {kind === "client" ? "the client's" : "the project's"} name to confirm</span>
        <input
          aria-label="Name to confirm"
          value={typed}
          placeholder={name}
          autoComplete="off"
          onChange={(e) => setTyped(e.target.value)}
        />
      </label>
      {del.error && <p className="autherr">{errorMessage(del.error, "Couldn't delete it")}</p>}
      <div className="confirm-acts">
        <button type="button" className="btn" onClick={onClose} disabled={del.isPending}>
          Cancel
        </button>
        <button
          type="button"
          className="btn danger"
          disabled={!matches || del.isPending}
          onClick={() => del.mutate({ kind, id }, { onSuccess: onDeleted })}
        >
          {del.isPending ? "Deleting…" : "Delete Permanently"}
        </button>
      </div>
    </Modal>
  );
}
