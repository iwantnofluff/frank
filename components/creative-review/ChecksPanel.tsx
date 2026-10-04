"use client";

import type { CreativeRow } from "@/hooks/use-creative";
import { useRefreshWiifmNote } from "@/hooks/use-refresh-wiifm-note";
import { errorMessage } from "@/lib/errors";
import type { CopyVersionRow } from "@/hooks/use-copy-versions";
import { copyFieldsFor, formatsLabel, postFormats, COPY_FIELD_LABELS } from "@/lib/formats";

// Informational only, same as BriefPanel — mirrors the read-only half of
// CreativeModal's own Checks tab (Latest Copy Version, WIIFM Direction).
// The three live Check WIIFM/Creative/Brand buttons stay modal-only: they
// run an AI call rather than display saved data, so there's nothing to
// mirror here without duplicating that whole feature outside the modal.
export function ChecksPanel({
  creative,
  latestCopyVersion,
  isStaff,
}: {
  creative: CreativeRow;
  latestCopyVersion: CopyVersionRow | null;
  // Staff can write a missing WIIFM direction from here.
  isStaff: boolean;
}) {
  const refresh = useRefreshWiifmNote(creative.id);
  const copyFieldSpecs = copyFieldsFor(postFormats(creative)).map((key) => ({
    key,
    label: COPY_FIELD_LABELS[key] ?? key,
  }));
  const includesCopy = copyFieldSpecs.length > 0;
  const approachNotes = creative.approach_notes ?? [];

  return (
    <div className="brief open reviewpanel">
      <div className="bf-b" style={{ display: "block" }}>
      <div className="bsec">
        <div className="bl">
          {latestCopyVersion ? `Latest Copy Version ${latestCopyVersion.version_no}` : "Latest Copy Version"}
        </div>
        {!includesCopy ? (
          <p className="fd-d">{postFormats(creative).length > 1 ? "These formats have" : `${formatsLabel(postFormats(creative))} has`} no caption fields.</p>
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
        ) : refresh.isPending ? (
          <p className="fd-d">Writing it…</p>
        ) : latestCopyVersion ? (
          // Copy is saved but the note wasn't written (the AI wasn't
          // reachable then, say).
          <>
            <p className="fd-d">
              The copy is saved, but its WIIFM direction hasn&rsquo;t been written.{" "}
              {isStaff && (
                <button type="button" className="badd" onClick={() => refresh.mutate(creative.agency_id)}>
                  Write It Now
                </button>
              )}
            </p>
            {refresh.isError && (
              <p className="autherr">{errorMessage(refresh.error, "Couldn't write the WIIFM direction")}</p>
            )}
          </>
        ) : (
          <p className="fd-d">No WIIFM direction yet — save some copy to generate one.</p>
        )}
      </div>
      </div>
    </div>
  );
}
