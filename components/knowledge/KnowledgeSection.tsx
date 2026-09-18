"use client";

import { useState } from "react";
import type { KnowledgeEntryRow } from "@/hooks/use-knowledge-entries";
import {
  useCreateKnowledgeEntry,
  useDeleteKnowledgeEntry,
  useUpdateKnowledgeEntry,
} from "@/hooks/use-knowledge-mutations";

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
  sectionKey,
  label,
  entries,
}: {
  clientId: string;
  sectionKey: string;
  label: string;
  entries: KnowledgeEntryRow[];
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const createEntry = useCreateKnowledgeEntry(clientId);
  const updateEntry = useUpdateKnowledgeEntry(clientId);
  const deleteEntry = useDeleteKnowledgeEntry(clientId);

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
              ) : (
                <>
                  <b>
                    {entry.title} <span className="mini">{entry.kind}</span>
                  </b>
                  <p>
                    {entry.kind === "link"
                      ? entry.url
                      : "Preview isn't wired up yet — file and image entries are stored but can't be viewed in this phase."}
                  </p>
                </>
              )}
              {entry.kind === "text" && (
                <div className="kbentry-acts">
                  <button
                    type="button"
                    className="btn sm ghost"
                    onClick={() => setEditingId(entry.id)}
                  >
                    Edit
                  </button>
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

        {adding ? (
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
        ) : (
          <button type="button" className="badd" onClick={() => setAdding(true)}>
            + Add note
          </button>
        )}
      </div>
    </div>
  );
}
