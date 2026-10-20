"use client";

import type { CreativeRow } from "@/hooks/use-creative";
import { formatById, formatsLabel, postFormats } from "@/lib/formats";
import { ReferenceLinks } from "@/components/project/ReferenceLinks";
import { useDesignDirections } from "@/hooks/use-design-directions";

// Informational only, on this page — editing the brief now happens in
// CreativeModal's Brief tab (the single entry point that replaced New
// Brief / Upload or Edit / Draft from Brief as three separate buttons).
// Mirrors that tab's own fields, but as plain read-only text throughout —
// no inputs, no textareas, nothing styled as an editable field box.
// Selection (which of Brief/Content/Checks/Feed Preview shows) is the
// page's own ReviewNav now, not a per-panel accordion.
export function BriefPanel({
  creative,
  teamNames,
}: {
  creative: CreativeRow;
  teamNames: string[];
}) {
  const formats = postFormats(creative);
  // Each content type once, in the order its formats were chosen.
  const categories = [...new Set(formats.map((id) => formatById(id)?.category).filter(Boolean))];
  const delivery = creative.projects?.delivery ?? "scheduled";
  // On the post itself (phase57), not a copy version.
  const slideText = creative.slide_text ?? [];
  // Notes for Designer (direct instruction): the post's overall note, and
  // one per image on a multi-image post (phase108).
  const overallNote = String(creative.cx?.designer_notes ?? "").trim();
  const slideNotes = creative.slide_notes ?? [];
  // The design direction the team chose from Design with Frank (phase110):
  // the newest run with one chosen. The team only: a Client reads none.
  const { data: directions } = useDesignDirections(creative.id);
  const chosenRun = directions?.find((r) => r.chosen !== null && r.body.directions[r.chosen]);
  const chosen = chosenRun ? chosenRun.body.directions[chosenRun.chosen!] : null;
  const guard = chosenRun?.body.guardrails;
  const guardrails = guard ? [...guard.format, ...guard.client, ...guard.avoid] : [];

  return (
    <div className="brief open reviewpanel">
      <div className="bf-b" style={{ display: "block" }}>
      <div className="bsec">
        <div className="bl">What Is It Called?</div>
        <p className="fd-d">{creative.name}</p>
      </div>

      <div className="bsec">
        <div className="bl">Content Type</div>
        <p className="fd-d">{categories.length ? categories.join(" + ") : "—"}</p>
      </div>

      <div className="bsec">
        <div className="bl">Format</div>
        <p className="fd-d">{formatsLabel(formats)}</p>
      </div>

      {delivery === "scheduled" ? (
        <div className="bsec">
          <div className="bl">Publish Date</div>
          <p className="fd-d">
            {creative.scheduled_at
              ? new Date(creative.scheduled_at).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })
              : "—"}
          </p>
        </div>
      ) : (
        <>
          <div className="bsec">
            <div className="bl">Needed By</div>
            <p className="fd-d">
              {creative.due_on ? new Date(creative.due_on).toLocaleDateString() : "—"}
            </p>
          </div>
        </>
      )}

      <div className="bsec">
        <div className="bl">Team</div>
        <p className="fd-d">{teamNames.length ? teamNames.join(", ") : "Nobody yet"}</p>
      </div>

      <div className="bsec">
        <div className="bl">Concept</div>
        <p className="fd-d">{creative.concept || "—"}</p>
      </div>

      <div className="bsec">
        <div className="bl">References</div>
        {creative.reference_urls?.length ? (
          <p className="fd-d fd-refs">
            <ReferenceLinks urls={creative.reference_urls} className="fd-ref" />
          </p>
        ) : (
          <p className="fd-d">—</p>
        )}
      </div>

      <div className="bsec">
        <div className="bl">Text on image</div>
        {slideText.length > 0 ? (
          slideText.map((text, i) => (
            <p className="fd-d" key={i}>
              <b>Slide {i + 1}: </b>
              {text || "—"}
            </p>
          ))
        ) : (
          <p className="fd-d">—</p>
        )}
      </div>

      {(overallNote || slideNotes.some((n) => n.trim())) && (
        <div className="bsec">
          <div className="bl">Notes for Designer</div>
          {overallNote && <p className="fd-d">{overallNote}</p>}
          {slideNotes.map((note, i) =>
            note.trim() ? (
              <p className="fd-d" key={i}>
                <b>Slide {i + 1}: </b>
                {note}
              </p>
            ) : null,
          )}
        </div>
      )}

      {chosen && (
        <div className="bsec">
          <div className="bl">Design Direction</div>
          <p className="fd-d">
            <b>{chosen.title}: </b>
            {chosen.idea}
          </p>
          {(
            [
              ["Layout", chosen.layout],
              ["Style", chosen.style],
              ["Palette", chosen.palette],
              ["Text on Image", chosen.textOnImage],
              ["First three seconds", chosen.reel?.hook],
              ["Shots", chosen.reel?.shots.join(" / ")],
              ["End frame", chosen.reel?.end],
            ] as const
          ).map(([label, text]) =>
            text ? (
              <p className="fd-d" key={label}>
                <b>{label}: </b>
                {text}
              </p>
            ) : null,
          )}
          {chosen.slides.map((line, i) => (
            <p className="fd-d" key={i}>
              <b>Slide {i + 1}: </b>
              {line}
            </p>
          ))}
          {guardrails.length > 0 && (
            <div className="fd-d">
              <b>Guardrails:</b>
              <ul className="ddir-list">
                {guardrails.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
