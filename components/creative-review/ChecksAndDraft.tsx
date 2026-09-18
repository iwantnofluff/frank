"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";

// Draft from Brief only — the three checks live inside the Upload or Edit
// modal now (UploadOrEditModal), under the copy fields, matching the
// prototype exactly (developer handover: "In the upload panel, under the
// copy fields... [Draft from Brief] sits in the New Brief window and the
// brief editor on the review screen — not in the upload panel, because by
// upload the copy already exists").

const DRAFT_OPTIONS = [
  { principle: "Scarcity", body: "Twelve spots left for the November intake — trials close Friday." },
  { principle: "Social proof", body: "Forty families already signed up this month. See what they're joining." },
  { principle: "Authority", body: "Coached by the same staff who train the first team's youth squad." },
];

function DraftModalBody() {
  const [generating, setGenerating] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setGenerating(false), 900);
    return () => clearTimeout(t);
  }, []);

  if (generating) {
    return <p className="sub">Reading the brief and the client knowledge…</p>;
  }

  return (
    <div>
      {DRAFT_OPTIONS.map((opt) => (
        <div className="draftopt" key={opt.principle}>
          <div className="draftopt-h">
            <b>{opt.principle}</b>
          </div>
          <p>{opt.body}</p>
          <div className="draftopt-acts">
            <button type="button" className="btn sm" disabled title="Not connected yet">
              Accept
            </button>
            <button type="button" className="btn sm" disabled title="Not connected yet">
              Edit
            </button>
            <button type="button" className="btn sm ghost" disabled title="Not connected yet">
              Dismiss
            </button>
          </div>
        </div>
      ))}
      <p className="checksource">
        Mock options — nothing here is generated yet. Selecting one will
        fill the copy fields and write the principle into the version note,
        same as any other edit.
      </p>
    </div>
  );
}

export function ChecksAndDraft() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="checkbar">
        <button type="button" className="btn primary sm" onClick={() => setOpen(true)}>
          Draft from Brief
        </button>
      </div>

      {open && (
        <Modal title="Draft from Brief" onClose={() => setOpen(false)}>
          <DraftModalBody />
        </Modal>
      )}
    </>
  );
}
