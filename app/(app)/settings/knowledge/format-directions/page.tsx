"use client";

import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { seesAllClients } from "@/lib/roles";
import { useFormatDirections } from "@/hooks/use-format-directions";
import { FormatCategorySection } from "@/components/settings/FormatCategorySection";
import { SettingsHead } from "@/components/settings/SettingsHead";
import { FORMATS, FORMAT_CATEGORIES, formatsByCategory } from "@/lib/formats";

// Settings → Knowledge → Format Directions (Reference Material and the
// drafting model have their own pages now).
export default function FormatDirectionsPage() {
  const { data: agency } = useMyAgency();
  // Owners and Admins change them (phase94); a User reads them.
  const { data: me } = useMyMembership(agency?.agencyId);
  const canEdit = !!me && !me.client_id && seesAllClients(me.role);
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
      <SettingsHead
        title="Format Directions"
        description="The direction the drafter follows for each format."
      />

      <div className="panel">
        <div className="panel-h">
          <b>Format Directions</b>
          <span className="sync">{FORMATS.length} formats</span>
        </div>
        <div className="fd-note">
          What each format needs from the copy. The drafter reads these when a
          brief names a format — edit one and every draft for that format
          changes.{me && !canEdit && " Only Owners and Admins can change them."}
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
                canEdit={canEdit}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
