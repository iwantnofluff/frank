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
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { KNOWLEDGE_FILE_EXTENSIONS } from "@/lib/knowledge-file-validation";
import { errorMessage } from "@/lib/errors";

// Kind colours and marks: the prototype's own KBCOL/KBICO
// (frank-prototype.html), as Settings' Reference Material uses.
const KB_COLOR: Record<KnowledgeEntryRow["kind"], string> = {
  text: "#007BFF",
  file: "#DC2626",
  link: "#0EA5E9",
  image: "#7C3AED",
};
const KB_MARK: Record<KnowledgeEntryRow["kind"], string> = { text: "Aa", file: "DOC", link: "URL", image: "IMG" };

function fileExt(filename: string) {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "DOC" : filename.slice(dot + 1).toUpperCase();
}

function fmtDay(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${d.toLocaleString("en-US", { month: "short" })} ${String(d.getFullYear()).slice(2)}`;
}

// A note being written or edited, in a row of its own (Settings' NoteEditor).
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
    <div className="kb-item enter">
      <span className="kb-ic" style={{ background: KB_COLOR.text }}>
        Aa
      </span>
      <span className="kb-b" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <input className="bin one" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea
          className="bin"
          rows={3}
          placeholder="Write it out — examples work better than adjectives."
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="kb-acts">
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
      </span>
    </div>
  );
}

// One area of a client's knowledge, as a panel in a stack (direct
// instruction: the same structure, padding and spacing as Settings'
// Reference Material, AgencyKnowledgeSection): title and count, a row per
// entry (kind square, title, body or link, meta line, actions), and the
// add choice at the foot. Writing is staff-only, as knowledge_entries'
// policies are; a client sees the rows only.
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
  isStaff: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // The entry Remove was pressed on, while its confirmation is open.
  const [removing, setRemoving] = useState<KnowledgeEntryRow | null>(null);
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
    // An anchor for See All on the client's page (BrandReminder).
    <div className="panel kb-section" id={`kb-${sectionKey}`}>
      <div className="panel-h">
        <b>{label}</b>
        <span className="sync">
          {entries.length} {entries.length === 1 ? "item" : "items"}
        </span>
      </div>

      {entries.map((entry) => {
        if (editingId === entry.id) {
          return (
            <EntryEditor
              key={entry.id}
              initialTitle={entry.title}
              initialBody={entry.body ?? ""}
              saving={updateEntry.isPending}
              onCancel={() => setEditingId(null)}
              onSave={(title, body) =>
                updateEntry.mutate({ id: entry.id, title, body }, { onSuccess: () => setEditingId(null) })
              }
            />
          );
        }
        const opens = (entry.kind === "file" || entry.kind === "image") && !!entry.asset;
        return (
          <div
            className={`kb-item${opens ? " open" : ""}`}
            key={entry.id}
            onClick={opens ? () => setPreviewing(entry) : undefined}
          >
            <span className="kb-ic" style={{ background: KB_COLOR[entry.kind] }}>
              {entry.kind === "file" && entry.asset ? fileExt(entry.asset.filename) : KB_MARK[entry.kind]}
            </span>
            <span className="kb-b">
              <b>{entry.title}</b>
              {entry.kind === "text" && entry.body && <span className="body">{entry.body}</span>}
              {entry.kind === "link" && entry.url && (
                <span className="note">
                  <a className="reflink" href={entry.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                    {entry.url}
                  </a>
                </span>
              )}
              <span className="meta">
                {(entry.kind === "file" || entry.kind === "image") &&
                  (entry.asset ? `${fileExt(entry.asset.filename)} · ` : "No file behind this entry · ")}
                {fmtDay(entry.created_at)}
              </span>
            </span>
            {isStaff && (
              <span className="kb-acts">
                {entry.kind === "text" && (
                  <button
                    type="button"
                    className="btn sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(entry.id);
                    }}
                  >
                    Edit
                  </button>
                )}
                <button
                  type="button"
                  className="btn sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteEntry.reset();
                    setRemoving(entry);
                  }}
                >
                  Remove
                </button>
              </span>
            )}
          </div>
        );
      })}

      {entries.length === 0 && !adding && <p className="kb-empty">Content pending</p>}

      {isStaff && adding && (
        <EntryEditor
          initialTitle=""
          initialBody=""
          saving={createEntry.isPending}
          onCancel={() => setAdding(false)}
          onSave={(title, body) =>
            createEntry.mutate({ section: sectionKey, title, body }, { onSuccess: () => setAdding(false) })
          }
        />
      )}

      {isStaff && (
        <div className="kb-foot">
          {/* Straight to the two ways in (direct instruction), no "Add …"
              step first. */}
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" className="fbtn" onClick={() => setAdding(true)}>
              Write Note
            </button>
            <button
              type="button"
              className="fbtn"
              disabled={createFileEntry.isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              {createFileEntry.isPending ? "Uploading…" : "Upload File"}
            </button>
          </div>
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
          {fileError && <p className="autherr">{fileError}</p>}
        </div>
      )}

      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.title}?`}
          message={"this takes it out of the knowledge used when copy is drafted and checked. It can't be undone."}
          confirmLabel="Remove"
          pendingLabel="Removing…"
          isPending={deleteEntry.isPending}
          error={deleteEntry.error}
          errorFallback="Couldn't remove it"
          onConfirm={() => deleteEntry.mutate(removing.id, { onSuccess: () => setRemoving(null) })}
          onClose={() => setRemoving(null)}
        />
      )}

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
