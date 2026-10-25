"use client";

import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { seesAllClients } from "@/lib/roles";
import { SettingsHead } from "@/components/settings/SettingsHead";
import { ProofreadRulesSettings } from "@/components/settings/ProofreadRulesSettings";

// Settings → Knowledge → Proofreading (phase122): the rules Frank
// proofreads saved copy by.
export default function ProofreadingPage() {
  const { data: agency } = useMyAgency();
  // Owners and Admins change them; a User reads them.
  const { data: me } = useMyMembership(agency?.agencyId);
  const canEdit = !!me && !me.client_id && seesAllClients(me.role);

  return (
    <div className="pad narrow">
      <SettingsHead title="Proofreading" description="The rules Frank proofreads copy by, each time it's saved." />
      {agency && <ProofreadRulesSettings agencyId={agency.agencyId} canEdit={canEdit} />}
    </div>
  );
}
