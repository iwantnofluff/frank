"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useMoveProjectToFolder } from "@/hooks/use-move-project-to-folder";
import { useCreateProjectFolder } from "@/hooks/use-create-project-folder";
import { errorMessage } from "@/lib/errors";
import type { ProjectFolderRow } from "@/hooks/use-project-folders";

// One folder per project (not tags), per direct instruction — a plain
// radio list, "No folder" always included first so a project already in
// one can be un-filed the same way it was filed. Also lets the folder
// that's needed be created right here, inline, rather than sending staff
// back out to Add Folder and reopening this same modal — the new folder
// is auto-selected the moment it's created.
export function MoveToFolderModal({
  projectId,
  clientId,
  projectName,
  currentFolderId,
  folders,
  onClose,
}: {
  projectId: string;
  clientId: string;
  projectName: string;
  currentFolderId: string | null;
  folders: ProjectFolderRow[];
  onClose: () => void;
}) {
  const moveProject = useMoveProjectToFolder();
  const createFolder = useCreateProjectFolder();
  const [selected, setSelected] = useState<string | null>(currentFolderId);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  async function handleSubmit() {
    await moveProject.mutateAsync({ projectId, clientId, folderId: selected });
    onClose();
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    const newId = await createFolder.mutateAsync({ clientId, name: newFolderName.trim() });
    setSelected(newId);
    setCreatingFolder(false);
    setNewFolderName("");
  }

  return (
    <Modal hideCloseButton
      title="Move to Folder"
      ariaLabel={`Move ${projectName} to folder`}
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
            disabled={moveProject.isPending || selected === currentFolderId}
            onClick={handleSubmit}
          >
            {moveProject.isPending ? "Moving…" : "Move"}
          </button>
        </>
      }
    >
      <p className="sub" style={{ marginBottom: 10 }}>
        Where should &ldquo;{projectName}&rdquo; live?
      </p>
      <div className="radios" role="radiogroup">
        <button
          type="button"
          role="radio"
          className="radio"
          aria-checked={selected === null}
          onClick={() => setSelected(null)}
        >
          <span className="rd" />
          <span>
            <b>No folder</b>
          </span>
        </button>
        {folders.map((f) => (
          <button
            key={f.id}
            type="button"
            role="radio"
            className="radio"
            aria-checked={selected === f.id}
            onClick={() => setSelected(f.id)}
          >
            <span className="rd" />
            <span>
              <b>{f.name}</b>
            </span>
          </button>
        ))}
      </div>
      {folders.length === 0 && !creatingFolder && (
        <p className="msection-empty">No folders yet.</p>
      )}

      {creatingFolder ? (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input
            className="bin one"
            autoFocus
            placeholder="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateFolder();
            }}
          />
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              setCreatingFolder(false);
              setNewFolderName("");
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn sm primary"
            disabled={createFolder.isPending || !newFolderName.trim()}
            onClick={handleCreateFolder}
          >
            {createFolder.isPending ? "Creating…" : "Create"}
          </button>
        </div>
      ) : (
        <button type="button" className="badd" onClick={() => setCreatingFolder(true)}>
          + New Folder
        </button>
      )}
      {createFolder.error && (
        <p className="autherr">{errorMessage(createFolder.error, "Couldn't create the folder")}</p>
      )}

      {moveProject.error && (
        <p className="autherr">{errorMessage(moveProject.error, "Couldn't move this project")}</p>
      )}
    </Modal>
  );
}
