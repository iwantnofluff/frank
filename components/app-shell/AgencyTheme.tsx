"use client";

import { useEffect } from "react";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useAgencySettings } from "@/hooks/use-agency-settings";
import { applyTheme, normaliseTheme } from "@/lib/theme";
import { useThemeDraft } from "@/store/theme-draft-store";
import { brandingAllowed } from "@/lib/plans";

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
    // Logo and colours are Growth and up (phase41); below that, Frank's own
    // look, whatever was saved — it comes back on upgrading.
    else if (settings !== undefined && agency) {
      applyTheme(normaliseTheme(brandingAllowed(agency.plan) ? settings?.theme : undefined));
    }
  }, [draft, settings, agency]);

  return null;
}
