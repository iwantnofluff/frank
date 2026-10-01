"use client";

import { useEffect } from "react";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useAgencySettings } from "@/hooks/use-agency-settings";
import { applyTheme, normaliseTheme } from "@/lib/theme";
import { useThemeDraft } from "@/store/theme-draft-store";

// Applies the agency's saved colours to the whole app — for staff and
// signed-in client members alike (agency_settings_select lets both read
// it). An unsaved Branding-page draft wins while one exists.
export function AgencyTheme() {
  const { data: agency } = useMyAgency();
  const { data: settings } = useAgencySettings(agency?.agencyId);
  const draft = useThemeDraft((s) => s.draft);

  useEffect(() => {
    if (draft) applyTheme(draft);
    // Once the query has answered: an agency that has never saved a theme
    // (no row) gets the default — which is also what puts the default back
    // after an unsaved Branding-page preview.
    else if (settings !== undefined) applyTheme(normaliseTheme(settings?.theme));
  }, [draft, settings]);

  return null;
}
