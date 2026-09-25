"use client";

import type { CreativeRow } from "@/hooks/use-creative";
import type { CopyVersionRow } from "@/hooks/use-copy-versions";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { formatById, COPY_FIELD_LABELS } from "@/lib/formats";

// Informational only, same as BriefPanel — mirrors the read-only half of
// CreativeModal's own Checks tab (Latest Copy Version, WIIFM Direction).
// The three live Check WIIFM/Creative/Brand buttons stay modal-only: they
// run an AI call rather than display saved data, so there's nothing to
// mirror here without duplicating that whole feature outside the modal.
export function ChecksPanel({
  creative,
  latestCopyVersion,
}: {
  creative: CreativeRow;
  latestCopyVersion: CopyVersionRow | null;
}) {
  const format = formatById(creative.format);
  const copyFieldSpecs = (format?.copyFields ?? []).map((key) => ({
    key,
    label: COPY_FIELD_LABELS[key] ?? key,
  }));
  const includesCopy = copyFieldSpecs.length > 0;
  const approachNotes = creative.approach_notes ?? [];

  return (
    <CollapsibleSection title="Checks">
      <div className="bsec">
        <div className="bl">
          {latestCopyVersion ? `Latest Copy Version ${latestCopyVersion.version_no}` : "Latest Copy Version"}
        </div>
        {!includesCopy ? (
          <p className="fd-d">{format?.label ?? "This format"} has no caption fields.</p>
        ) : !latestCopyVersion ? (
          <p className="fd-d">No copy saved yet.</p>
        ) : (
          copyFieldSpecs.map((spec) => {
            const value = latestCopyVersion.fields?.[spec.key];
            return value ? (
              <p className="fd-d" key={spec.key}>
                <b>{spec.label}: </b>
                {value}
              </p>
            ) : null;
          })
        )}
      </div>

      <div className="bsec">
        <div className="bl">WIIFM Direction</div>
        {approachNotes.length > 0 ? (
          approachNotes.map((note, i) => (
            <p className="fd-d" key={i}>
              {note}
            </p>
          ))
        ) : (
          <p className="fd-d">No WIIFM direction yet — save some copy to generate one.</p>
        )}
      </div>
    </CollapsibleSection>
  );
}
