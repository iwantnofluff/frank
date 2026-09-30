"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useCreateProjectFolder } from "@/hooks/use-create-project-folder";
import { useRenameProjectFolder } from "@/hooks/use-rename-project-folder";
import { errorMessage } from "@/lib/errors";

// Create and rename share one modal, same convention as CreativeModal's
// own create/edit duality — `folder` null means create, otherwise rename.
export function FolderModal({
  clientId,
  folder,
  onClose,
}: {
  clientId: string;
  folder: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const createFolder = useCreateProjectFolder();
  const renameFolder = useRenameProjectFolder();
  const isRename = !!folder;

  const [name, setName] = useState(folder?.name ?? "");
  const [nameError, setNameError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim()) {
      setNameError("Give it a name first.");
      return;
    }
    setNameError(null);

    if (isRename) {
      await renameFolder.mutateAsync({ folderId: folder!.id, clientId, name: name.trim() });
    } else {
      await createFolder.mutateAsync({ clientId, name: name.trim() });
    }
    onClose();
  }

  const isPending = isRename ? renameFolder.isPending : createFolder.isPending;
  const submitError = isRename
    ? renameFolder.error && errorMessage(renameFolder.error, "Couldn't rename the folder")
    : createFolder.error && errorMessage(createFolder.error, "Couldn't create the folder");

  return (
    <Modal
      title={isRename ? "Rename Folder" : "Add Folder"}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <div className="grow" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={isPending} onClick={handleSubmit}>
            {isPending ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="folderName">Folder name</label>
        <input
          id="folderName"
          value={name}
          autoFocus
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError(null);
          }}
        />
        {nameError && <p className="autherr">{nameError}</p>}
      </div>

      {submitError && <p className="autherr">{submitError}</p>}
    </Modal>
  );
}
