"use client";

import type { CreativeRow } from "@/hooks/use-creative";
import type { CopyVersionRow } from "@/hooks/use-copy-versions";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { formatById } from "@/lib/formats";

// Informational only, on this page — editing the brief now happens in
// CreativeModal's Brief tab (the single entry point that replaced New
// Brief / Upload or Edit / Draft from Brief as three separate buttons).
// Mirrors that tab's own fields, but as plain read-only text throughout —
// no inputs, no textareas, nothing styled as an editable field box.
// Collapsed by default, since it's a reference glance, not a workspace.
export function BriefPanel({
  creative,
  latestCopyVersion,
  leadName,
}: {
  creative: CreativeRow;
  latestCopyVersion: CopyVersionRow | null;
  leadName: string | null;
}) {
  const format = formatById(creative.format);
  const delivery = creative.projects?.delivery ?? "scheduled";
  const slideText = latestCopyVersion?.slide_text ?? [];

  return (
    <CollapsibleSection title="Brief">
      <div className="bsec">
        <div className="bl">What Is It Called?</div>
        <p className="fd-d">{creative.name}</p>
      </div>

      <div className="bsec">
        <div className="bl">Content Type</div>
        <p className="fd-d">{format?.category ?? "—"}</p>
      </div>

      <div className="bsec">
        <div className="bl">Format</div>
        <p className="fd-d">{format?.label ?? creative.format}</p>
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
    </CollapsibleSection>
  );
}
