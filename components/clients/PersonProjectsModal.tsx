"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { errorMessage } from "@/lib/errors";

function Tick({ on }: { on: boolean }) {
  return (
    <span className={`cbx${on ? " on" : ""}`}>
      <svg viewBox="0 0 24 24">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </span>
  );
}

// Which of a client's projects someone is on, from "Edit Projects" under
// their name (direct instruction, in place of the row's dropdown). Saved
// with its own button, which greys out with "Saved" once done.
export function PersonProjectsModal({
  name,
  projects,
  initial,
  onSave,
  onClose,
}: {
  name: string;
  projects: { id: string; name: string }[];
  // The live projects they're on.
  initial: string[];
  onSave: (next: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<string[]>(initial);
  const [saved, setSaved] = useState<string[]>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [justSaved, setJustSaved] = useState(false);
  const changed = chosen.length !== saved.length || chosen.some((id) => !saved.includes(id));
  const all = chosen.length === projects.length;

  function update(next: string[]) {
    setChosen(next);
    setJustSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave(chosen);
      setSaved(chosen);
      setJustSaved(true);
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`${name}'s Projects`}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <span className="grow">{justSaved && !changed ? <span className="bsaved">Saved</span> : null}</span>
          <button type="button" className="btn" onClick={onClose}>
            {justSaved && !changed ? "Done" : "Cancel"}
          </button>
          <button type="button" className="btn primary" disabled={!changed || saving} onClick={() => save()}>
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <p className="msection-d">The projects {name} can see. A project made later starts with everyone on this client.</p>
      <div className="cp-b projchecks">
        <button
          type="button"
          className="cpr all"
          role="checkbox"
          aria-checked={all}
          onClick={() => update(all ? [] : projects.map((p) => p.id))}
        >
          <Tick on={all} />
          <span className="cn">All projects</span>
        </button>
        {projects.map((p) => {
          const on = chosen.includes(p.id);
          return (
            <button
              type="button"
              key={p.id}
              className="cpr"
              role="checkbox"
              aria-checked={on}
              onClick={() => update(on ? chosen.filter((x) => x !== p.id) : [...chosen, p.id])}
            >
              <Tick on={on} />
              <span className="cn">{p.name}</span>
            </button>
          );
        })}
      </div>
      {error ? <p className="autherr">{errorMessage(error, "Couldn't save their projects")}</p> : null}
    </Modal>
  );
}
