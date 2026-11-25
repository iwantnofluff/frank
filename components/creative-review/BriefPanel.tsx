"use client";

import type { CreativeRow } from "@/hooks/use-creative";
import { formatById, formatsLabel, postFormats } from "@/lib/formats";
import { ReferenceLinks } from "@/components/project/ReferenceLinks";
import { useDesignerNotes } from "@/hooks/use-designer-notes";
import { NotesText } from "@/components/creative-review/NotesText";
import { ConceptText } from "@/components/creative-review/ConceptText";

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
  // Notes for Designer (direct instruction): the post's overall note, and
  // one per image on a multi-image post. The team's only (phase112): a
  // Client reads none, and the section doesn't show.
  const { data: notes } = useDesignerNotes(creative.id);
  const overallNote = notes?.overall.trim() ?? "";
  const slideNotes = notes?.slides ?? [];

  return (
    <BriefFields
      name={creative.name}
      formats={postFormats(creative)}
      delivery={creative.projects?.delivery ?? "scheduled"}
      scheduledAt={creative.scheduled_at}
      dueOn={creative.due_on}
      publishOn={creative.publish_on}
      teamNames={teamNames}
      concept={creative.concept}
      referenceUrls={creative.reference_urls}
      slideText={creative.slide_text ?? []}
    >
      {(overallNote || slideNotes.some((n) => n.trim())) && (
        <div className="bsec">
          <div className="bl">Notes for Designer</div>
          {overallNote && (
            <p className="fd-d">
              <NotesText text={overallNote} />
            </p>
          )}
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
    </BriefFields>
  );
}

// The brief as read-only text, from plain values: the post's page above,
// and the review link, which has no session to read the post with.
export function BriefFields({
  name,
  formats,
  delivery,
  scheduledAt,
  dueOn,
  publishOn,
  teamNames,
  concept,
  referenceUrls,
  slideText,
  children,
}: {
  name: string;
  formats: string[];
  delivery: "scheduled" | "continuous";
  scheduledAt: string | null;
  dueOn: string | null | undefined;
  publishOn: string | null | undefined;
  teamNames: string[];
  concept: string | null | undefined;
  referenceUrls: string[] | null | undefined;
  // On the post itself (phase57), not a copy version.
  slideText: string[];
  children?: React.ReactNode;
}) {
  // Each content type once, in the order its formats were chosen.
  const categories = [...new Set(formats.map((id) => formatById(id)?.category).filter(Boolean))];

  return (
    <div className="brief open reviewpanel">
      <div className="bf-b" style={{ display: "block" }}>
      <div className="bsec">
        <div className="bl">What Is It Called?</div>
        <p className="fd-d">{name}</p>
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
            {scheduledAt
              ? new Date(scheduledAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })
              : "—"}
          </p>
        </div>
      ) : (
        <>
          {/* When the work is due, and when it goes live (phase140). */}
          <div className="bsec">
            <div className="bl">Due Date</div>
            <p className="fd-d">
              {dueOn ? new Date(`${dueOn}T00:00:00`).toLocaleDateString("en-GB") : "—"}
            </p>
          </div>
          <div className="bsec">
            <div className="bl">Publish Date</div>
            <p className="fd-d">
              {publishOn ? new Date(`${publishOn}T00:00:00`).toLocaleDateString("en-GB") : "—"}
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
        <p className="fd-d">{concept ? <ConceptText text={concept} /> : "—"}</p>
      </div>

      <div className="bsec">
        <div className="bl">References</div>
        {referenceUrls?.length ? (
          <p className="fd-d fd-refs">
            <ReferenceLinks urls={referenceUrls} className="fd-ref" />
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

      {children}
      </div>
    </div>
  );
}
