"use client";

import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { useAgencySettings } from "@/hooks/use-agency-settings";
import { seesAllClients } from "@/lib/roles";
import { BrandForm, type BrandPart } from "./BrandForm";
import { SettingsHead } from "./SettingsHead";

// A Settings page showing one part of the agency's look (BrandForm).
export function BrandPartPage({ part, title, description }: { part: BrandPart; title: string; description: string }) {
  const { data: agency } = useMyAgency();
  const { data: me } = useMyMembership(agency?.agencyId);
  const { data: settings, isLoading } = useAgencySettings(agency?.agencyId);
  const canEdit = me?.client_id === null && seesAllClients(me?.role);
  return (
    <div className="pad" style={{ maxWidth: 1100 }}>
      <SettingsHead title={title} description={description} />
      {agency && !isLoading && (
        <BrandForm part={part} agencyId={agency.agencyId} agencyName={agency.name} settings={settings ?? null} canEdit={canEdit} />
      )}
    </div>
  );
}
