"use client";

import { useRef, useState } from "react";
import { useAgencyKnowledge } from "@/hooks/use-agency-knowledge";
import {
  useCreateAgencyKnowledgeEntry,
  useCreateAgencyKnowledgeFile,
  useDeleteAgencyKnowledgeEntry,
} from "@/hooks/use-agency-knowledge-mutations";
import { KnowledgeFilePreviewModal } from "@/components/knowledge/KnowledgeFilePreviewModal";
import { KNOWLEDGE_FILE_EXTENSIONS } from "@/lib/knowledge-file-validation";
import { errorMessage } from "@/lib/errors";
import type { AgencyKnowledgeEntryRow } from "@/hooks/use-agency-knowledge";

// Icon-square color by kind — ports the prototype's KBCOL (frank-prototype.html).
// Agency knowledge only ever has "text" or "file" kinds (unlike client-level
// knowledge_entries, which also has "link"/"image") — see phase11_agency_knowledge.sql.
const KB_COLOR: Record<AgencyKnowledgeEntryRow["kind"], string> = {
  text: "#007BFF",
  file: "#DC2626",
};

function fileExt(filename: string) {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "DOC" : filename.slice(dot + 1).toUpperCase();
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDay(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${d.toLocaleString("en-US", { month: "short" })} ${String(d.getFullYear()).slice(2)}`;
}

function NoteEditor({
  onSave,
  onCancel,
  saving,
}: {
  onSave: (title: string, body: string) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  return (
    <div className="kb-item">
      <span className="kb-ic" style={{ background: KB_COLOR.text }}>
        Aa
      </span>
      <span className="kb-b" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <input
          className="bin one"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="bin"
          rows={3}
          placeholder="Write it out."
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

// Agency-wide reference material — Ca$hvertising, Cialdini, internal
// playbooks. Ports the prototype's renderMethod() "Reference Material"
// panel (frank-prototype.html) markup exactly: a .panel with a .panel-h
// title+count, one .kb-item row per entry (colored .kb-ic square, title,
// body/meta line, .kb-acts), and a .kb-foot with a single "Add Reference"
// button — rather than the generic .kbcard grid client-level Knowledge
// still uses. This whole page is already staff-only (SettingsLayout
// redirects a client-role session before this ever renders), so there's no
// isStaff prop to thread through.
export function AgencyKnowledgeSection({ agencyId }: { agencyId: string | undefined }) {
  const { data: entries, isLoading, isError } = useAgencyKnowledge(agencyId);
  const createEntry = useCreateAgencyKnowledgeEntry(agencyId);
  const createFile = useCreateAgencyKnowledgeFile(agencyId);
  const deleteEntry = useDeleteAgencyKnowledgeEntry(agencyId);

  const [addChoice, setAddChoice] = useState(false);
  const [adding, setAdding] = useState(false);
  const [previewing, setPreviewing] = useState<AgencyKnowledgeEntryRow | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFilePicked(file: File) {
    setFileError(null);
    setAddChoice(false);
    try {
      await createFile.mutateAsync({ title: file.name, file });
    } catch (err) {
      setFileError(errorMessage(err, "Couldn't upload this file"));
    }
  }

  return (
    <div style={{ marginTop: 24 }}>
      {isError && (
        <div className="empty">
          <b>Couldn&rsquo;t load reference material</b>
        </div>
      )}

      {!isError && !isLoading && (
        <div className="panel">
          <div className="panel-h">
            <b>Reference Material</b>
            <span className="sync">
              {entries?.length ?? 0} {(entries?.length ?? 0) === 1 ? "item" : "items"}
            </span>
          </div>

          {(entries ?? []).map((entry) => {
            const isFile = entry.kind === "file" && entry.asset;
            return (
              <div
                className={`kb-item${isFile ? " open" : ""}`}
                key={entry.id}
                onClick={isFile ? () => setPreviewing(entry) : undefined}
              >
                <span className="kb-ic" style={{ background: KB_COLOR[entry.kind] }}>
                  {entry.kind === "file" && entry.asset ? fileExt(entry.asset.filename) : "Aa"}
                </span>
                <span className="kb-b">
                  <b>{entry.title}</b>
                  {entry.kind === "text" && entry.body && <span className="body">{entry.body}</span>}
                  <span className="meta">
                    {entry.kind === "file" && entry.asset
                      ? `${fileExt(entry.asset.filename)} · ${formatBytes(entry.asset.bytes)} · `
                      : ""}
                    {entry.authorName} · {fmtDay(entry.created_at)}
                  </span>
                </span>
                <span className="kb-acts">
                  <button
                    type="button"
                    className="btn sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteEntry.mutate(entry.id);
                    }}
                  >
                    Remove
                  </button>
                </span>
              </div>
            );
          })}

          {(entries ?? []).length === 0 && !adding && <p className="kb-empty">Nothing here yet.</p>}

          {adding && (
            <NoteEditor
              saving={createEntry.isPending}
              onCancel={() => setAdding(false)}
              onSave={(title, body) =>
                createEntry.mutate({ title, body }, { onSuccess: () => setAdding(false) })
              }
            />
          )}

          <div className="kb-foot">
            {addChoice ? (
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  className="fbtn"
                  onClick={() => {
                    setAddChoice(false);
                    setAdding(true);
                  }}
                >
                  Write a note
                </button>
                <button
                  type="button"
                  className="fbtn"
                  disabled={createFile.isPending}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {createFile.isPending ? "Uploading…" : "Upload a file"}
                </button>
                <button type="button" className="btn sm" onClick={() => setAddChoice(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" className="fbtn" onClick={() => setAddChoice(true)}>
                Add Reference
              </button>
            )}
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
        </div>
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
