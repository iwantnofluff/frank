"use client";

import { useMyAgency } from "@/hooks/use-my-agency";
import { useFormatDirections } from "@/hooks/use-format-directions";
import { FormatCategorySection } from "@/components/settings/FormatCategorySection";
import { AgencyKnowledgeSection } from "@/components/settings/AgencyKnowledgeSection";
import { AiModelSettings } from "@/components/settings/AiModelSettings";
import { FORMATS, FORMAT_CATEGORIES, formatsByCategory } from "@/lib/formats";

// Route stays /settings/knowledge — Format Directions and Reference
// Material both live here, matching the reference design's single
// "Knowledge" tab holding both.
export default function FormatDirectionsPage() {
  const { data: agency } = useMyAgency();
  const {
    data: formats,
    isLoading,
    isError,
  } = useFormatDirections(agency?.agencyId);

  // Every format in the catalog is always listed (frank-prototype.html's
  // FORMAT_DIR is the whole catalog, not an opt-in subset) — a format with
  // no saved row yet just has nothing in this map, and its row renders
  // with "no caption" and no direction text until someone edits it.
  const recordsById = new Map((formats ?? []).map((r) => [r.format_id, r]));

  return (
    <div className="pad narrow">
      <h1 className="h1">Knowledge</h1>

      <div className="note">
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 16v-5M12 8h.01" />
        </svg>
        <div>
          The method the agency works to — shared across every client at{" "}
          {agency?.name ?? "this agency"}, and the reference material the team
          writes and drafts against.
        </div>
      </div>

      <AiModelSettings agencyId={agency?.agencyId} />

      <div className="panel">
        <div className="panel-h">
          <b>Format Directions</b>
          <span className="sync">{FORMATS.length} formats</span>
        </div>
        <div className="fd-note">
          What each format needs from the copy. The drafter reads these when a
          brief names a format — edit one and every draft for that format
          changes.
        </div>

        {isError && (
          <div className="empty">
            <b>Couldn&rsquo;t load format directions</b>
          </div>
        )}

        {!isError && !isLoading && agency && (
          <>
            {FORMAT_CATEGORIES.map((category, i) => (
              <FormatCategorySection
                key={category}
                category={category}
                agencyId={agency.agencyId}
                formats={formatsByCategory(category)}
                recordsById={recordsById}
                defaultOpen={i === 0}
              />
            ))}
          </>
        )}
      </div>

      <AgencyKnowledgeSection agencyId={agency?.agencyId} />
    </div>
  );
}
