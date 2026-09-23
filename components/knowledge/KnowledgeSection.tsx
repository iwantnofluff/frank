"use client";

import { useRef, useState } from "react";
import type { KnowledgeEntryRow } from "@/hooks/use-knowledge-entries";
import {
  useCreateKnowledgeEntry,
  useCreateKnowledgeFileEntry,
  useDeleteKnowledgeEntry,
  useUpdateKnowledgeEntry,
} from "@/hooks/use-knowledge-mutations";
import { KnowledgeFilePreviewModal } from "@/components/knowledge/KnowledgeFilePreviewModal";
import { KNOWLEDGE_FILE_EXTENSIONS } from "@/lib/knowledge-file-validation";
import { errorMessage } from "@/lib/errors";

function EntryEditor({
  initialTitle,
  initialBody,
  onSave,
  onCancel,
  saving,
}: {
  initialTitle: string;
  initialBody: string;
  onSave: (title: string, body: string) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);

  return (
    <div className="kbentry editing">
      <input
        className="bin one"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="bin"
        rows={3}
        placeholder="Write it out — examples work better than adjectives."
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="kbentry-acts">
        <button
          type="button"
          className="btn primary sm"
          disabled={saving || !title.trim()}
          onClick={() => onSave(title.trim(), body.trim())}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function KnowledgeSection({
  clientId,
  agencyId,
  sectionKey,
  label,
  entries,
  isStaff,
}: {
  clientId: string;
  agencyId: string | undefined;
  sectionKey: string;
  label: string;
  entries: KnowledgeEntryRow[];
  // knowledge_entries' insert/update/delete RLS policies were already
  // staff-only before this session touched anything (clients only ever
  // had a select policy) — this UI just never matched that.
  isStaff: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<KnowledgeEntryRow | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createEntry = useCreateKnowledgeEntry(clientId);
  const createFileEntry = useCreateKnowledgeFileEntry(clientId, agencyId);
  const updateEntry = useUpdateKnowledgeEntry(clientId);
  const deleteEntry = useDeleteKnowledgeEntry(clientId);

  async function handleFilePicked(file: File) {
    setFileError(null);
    try {
      await createFileEntry.mutateAsync({ section: sectionKey, title: file.name, file });
    } catch (err) {
      setFileError(errorMessage(err, "Couldn't upload this file"));
    }
  }

  return (
    <div className="kbcard">
      <div className="kbcard-h">
        <b>{label}</b>
        <span className="n">{entries.length}</span>
      </div>

      <div className="kbcard-b">
        {entries.map((entry) =>
          editingId === entry.id ? (
            <EntryEditor
              key={entry.id}
              initialTitle={entry.title}
              initialBody={entry.body ?? ""}
              saving={updateEntry.isPending}
              onCancel={() => setEditingId(null)}
              onSave={(title, body) =>
                updateEntry.mutate(
                  { id: entry.id, title, body },
                  { onSuccess: () => setEditingId(null) },
                )
              }
            />
          ) : (
            <div className="kbentry" key={entry.id}>
              {entry.kind === "text" ? (
                <>
                  <b>{entry.title}</b>
                  <p>{entry.body || "—"}</p>
                </>
              ) : entry.kind === "link" ? (
                <>
                  <b>
                    {entry.title} <span className="mini">{entry.kind}</span>
                  </b>
                  <p>{entry.url}</p>
                </>
              ) : entry.asset ? (
                <>
                  <button
                    type="button"
                    className="kbfile"
                    onClick={() => setPreviewing(entry)}
                  >
                    {entry.title} <span className="mini">{entry.kind}</span>
                  </button>
                  <p>{entry.asset.filename}</p>
                </>
              ) : (
                <>
                  <b>
                    {entry.title} <span className="mini">{entry.kind}</span>
                  </b>
                  <p className="kbempty">No file behind this entry.</p>
                </>
              )}
              {isStaff && (
                <div className="kbentry-acts">
                  {entry.kind === "text" && (
                    <button
                      type="button"
                      className="btn sm ghost"
                      onClick={() => setEditingId(entry.id)}
                    >
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn sm ghost"
                    onClick={() => deleteEntry.mutate(entry.id)}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          ),
        )}

        {entries.length === 0 && !adding && (
          <p className="kbempty">Nothing here yet.</p>
        )}

        {isStaff && adding && (
          <EntryEditor
            initialTitle=""
            initialBody=""
            saving={createEntry.isPending}
            onCancel={() => setAdding(false)}
            onSave={(title, body) =>
              createEntry.mutate(
                { section: sectionKey, title, body },
                { onSuccess: () => setAdding(false) },
              )
            }
          />
        )}

        {isStaff && !adding && (
          <div className="kbentry-acts" style={{ marginTop: 0 }}>
            <button type="button" className="badd" onClick={() => setAdding(true)}>
              + Add note
            </button>
            <button
              type="button"
              className="badd"
              disabled={createFileEntry.isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              {createFileEntry.isPending ? "Uploading…" : "+ Add file"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={KNOWLEDGE_FILE_EXTENSIONS}
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) handleFilePicked(file);
              }}
            />
          </div>
        )}
        {fileError && <p className="autherr">{fileError}</p>}
      </div>

      {previewing && previewing.asset && (
        <KnowledgeFilePreviewModal
          storageKey={previewing.asset.storage_key}
          filename={previewing.asset.filename}
          mimeType={previewing.asset.mime_type}
          onClose={() => setPreviewing(null)}
        />
      )}
    </div>
  );
}
