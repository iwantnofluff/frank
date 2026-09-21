"use client";

import { useState } from "react";
import type { CreativeRow } from "@/hooks/use-creative";
import type { CopyVersionRow } from "@/hooks/use-copy-versions";
import { useUpdateBrief } from "@/hooks/use-update-brief";
import { useSaveSlideText } from "@/hooks/use-save-slide-text";
import { ListEditor } from "@/components/ui/ListEditor";

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function BriefPanel({
  creative,
  latestCopyVersion,
}: {
  creative: CreativeRow;
  latestCopyVersion: CopyVersionRow | null;
}) {
  const [open, setOpen] = useState(true);
  const [concept, setConcept] = useState(creative.concept ?? "");
  const [referenceUrl, setReferenceUrl] = useState(
    creative.reference_url ?? "",
  );
  const [approachNotes, setApproachNotes] = useState<string[]>(
    creative.approach_notes ?? [],
  );
  const [slideText, setSlideText] = useState<string[]>(
    latestCopyVersion?.slide_text ?? [],
  );

  const updateBrief = useUpdateBrief(creative.id);
  const saveSlideText = useSaveSlideText(creative.id);

  const saving = updateBrief.isPending || saveSlideText.isPending;
  const error = updateBrief.error || saveSlideText.error;

  async function handleSave() {
    await updateBrief.mutateAsync({ concept, referenceUrl, approachNotes });

    const previousSlideText = latestCopyVersion?.slide_text ?? [];
    const cleanedSlideText = slideText.map((s) => s.trim());
    if (JSON.stringify(cleanedSlideText) !== JSON.stringify(previousSlideText)) {
      await saveSlideText.mutateAsync({
        slideText: cleanedSlideText,
        latest: latestCopyVersion,
      });
    }
  }

  return (
    <div className={`brief${open ? " open" : ""}`}>
      <button
        type="button"
        className="bf-h"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <b>Brief</b>
        {updateBrief.isSuccess && !saving && (
          <span className="bn">Saved</span>
        )}
        <ChevronIcon />
      </button>

      {open && (
        <div className="bf-b">
          <div className="bsec">
            <div className="bl">Concept</div>
            <textarea
              className="bin"
              rows={3}
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="What is this piece, in a sentence or two?"
            />
          </div>

          <div className="bsec">
            <div className="bl">Reference link</div>
            <input
              className="bin one"
              type="url"
              value={referenceUrl}
              onChange={(e) => setReferenceUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>

          <ListEditor
            label="Approach notes — WIIFM rationale"
            itemLabel={(i) => `Note ${i + 1}`}
            values={approachNotes}
            onChange={setApproachNotes}
          />

          <ListEditor
            label="Text on image"
            itemLabel={(i) => `Slide ${i + 1}`}
            values={slideText}
            onChange={setSlideText}
          />

          <div className="bfoot">
            <button
              type="button"
              className="btn primary sm"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save brief"}
            </button>
            <div className="grow" />
            {error && (
              <span className="berr">
                {error instanceof Error ? error.message : "Couldn't save"}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
