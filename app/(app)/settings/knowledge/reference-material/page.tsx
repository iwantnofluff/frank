"use client";

import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { seesAllClients } from "@/lib/roles";
import { AgencyKnowledgeSection } from "@/components/settings/AgencyKnowledgeSection";
import { SettingsHead } from "@/components/settings/SettingsHead";

export default function ReferenceMaterialPage() {
  const { data: agency } = useMyAgency();
  // Owners and Admins add and remove it (phase94); a User reads it.
  const { data: me } = useMyMembership(agency?.agencyId);
  const canEdit = !!me && !me.client_id && seesAllClients(me.role);
  return (
    <div className="pad narrow">
      <SettingsHead
        title="Reference Material"
        description={`How ${agency?.name ?? "the agency"} works, shared across every client — read when copy is drafted and checked.`}
      />
      {me && !canEdit && <p className="note">Only Owners and Admins can add or remove Reference Material.</p>}
      <AgencyKnowledgeSection agencyId={agency?.agencyId} canEdit={canEdit} />
    </div>
  );
}
