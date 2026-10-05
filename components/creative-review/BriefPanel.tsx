"use client";

import type { CreativeRow } from "@/hooks/use-creative";
import { formatById, formatsLabel, postFormats } from "@/lib/formats";

// Informational only, on this page — editing the brief now happens in
// CreativeModal's Brief tab (the single entry point that replaced New
// Brief / Upload or Edit / Draft from Brief as three separate buttons).
// Mirrors that tab's own fields, but as plain read-only text throughout —
// no inputs, no textareas, nothing styled as an editable field box.
// Selection (which of Brief/Content/Checks/Feed Preview shows) is the
// page's own ReviewNav now, not a per-panel accordion.
export function BriefPanel({
  creative,
  leadName,
}: {
  creative: CreativeRow;
  leadName: string | null;
}) {
  const formats = postFormats(creative);
  // Each content type once, in the order its formats were chosen.
  const categories = [...new Set(formats.map((id) => formatById(id)?.category).filter(Boolean))];
  const delivery = creative.projects?.delivery ?? "scheduled";
  // On the post itself (phase57), not a copy version.
  const slideText = creative.slide_text ?? [];

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
            <div className="bl">Destination</div>
            <p className="fd-d">{creative.destination || "—"}</p>
          </div>
          <div className="bsec">
            <div className="bl">Needed By</div>
            <p className="fd-d">
              {creative.due_on ? new Date(creative.due_on).toLocaleDateString() : "—"}
            </p>
          </div>
        </>
      )}

      <div className="bsec">
        <div className="bl">Lead</div>
        <p className="fd-d">{leadName || "Unassigned"}</p>
      </div>

      <div className="bsec">
        <div className="bl">Concept</div>
        <p className="fd-d">{creative.concept || "—"}</p>
      </div>

      <div className="bsec">
        <div className="bl">Reference link</div>
        <p className="fd-d">{creative.reference_url || "—"}</p>
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
      </div>
    </div>
  );
}
