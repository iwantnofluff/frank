"use client";

import { useMyAgency } from "@/hooks/use-my-agency";
import { AgencyKnowledgeSection } from "@/components/settings/AgencyKnowledgeSection";
import { SettingsHead } from "@/components/settings/SettingsHead";

export default function ReferenceMaterialPage() {
  const { data: agency } = useMyAgency();
  return (
    <div className="pad narrow">
      <SettingsHead
        title="Reference Material"
        description={`How ${agency?.name ?? "the agency"} works, shared across every client — read when copy is drafted and checked.`}
      />
      <AgencyKnowledgeSection agencyId={agency?.agencyId} />
    </div>
  );
}
