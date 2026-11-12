"use client";

import { SettingsHead } from "@/components/settings/SettingsHead";
import { StatusListEditor } from "@/components/settings/StatusListEditor";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { seesAllClients } from "@/lib/roles";

// Settings → General → Statuses (phase151, direct instruction; was each
// project's Settings): the agency's statuses within each stage, which every
// client uses unless it has its own (Client Settings → Statuses). Owners
// and Admins change them, each saved as it's made.
export default function StatusesSettingsPage() {
  const { data: agency } = useMyAgency();
  const { data: me } = useMyMembership(agency?.agencyId);
  const canEdit = !!me && !me.client_id && seesAllClients(me.role);
  return (
    <div className="pad narrow">
      <SettingsHead
        title="Statuses"
        description="The steps a post moves through within each stage, for your team only. A post takes its stage's first when it gets there. Every client uses these, unless it has its own in its Client Settings."
      />
      {me && !canEdit && <p className="note">Only Owners and Admins can change these.</p>}
      <p className="sub" style={{ marginBottom: 16 }}>
        A post on a status that hides its posts, such as Cancel, is left out of the tables, the feed and the counts. Show
        Hidden in a table&rsquo;s status filter brings it back.
      </p>
      <StatusListEditor list={agency ? { agencyId: agency.agencyId, clientId: null } : undefined} canManage={canEdit} />
    </div>
  );
}
