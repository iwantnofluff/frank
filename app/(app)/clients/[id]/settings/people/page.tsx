"use client";

import { use, useState } from "react";
import { SettingsHead } from "@/components/settings/SettingsHead";
import { ClientPeople } from "@/components/clients/ClientSettingsParts";
import { InviteMemberModal } from "@/components/team/InviteMemberModal";
import { useClientDetail } from "@/hooks/use-client";
import { useProjects } from "@/hooks/use-projects";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { rolesICanInvite, seesAllClients } from "@/lib/roles";

// Client Settings → People (direct instruction: the Client Profile window's
// People): the client's Users and Clients and which of its live projects
// each is on, changed straight away by Owners and Admins, plus inviting.
export default function ClientPeoplePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: client } = useClientDetail(id);
  const { data: projects } = useProjects(id);
  const { data: agency } = useMyAgency();
  const { data: me } = useMyMembership(agency?.agencyId);
  const isAdmin = !!me && !me.client_id && seesAllClients(me.role);
  const inviteRoles = rolesICanInvite(me);
  const [inviting, setInviting] = useState(false);
  const live = (projects ?? []).filter((p) => !p.archived_at);

  return (
    <div className="pad narrow">
      <SettingsHead title="People" description={`Who's on ${client?.name ?? "this client"}, and which of its projects.`} />
      {agency && client && (
        <section className="panel">
          <div className="panel-b">
            <ClientPeople
              agencyId={agency.agencyId}
              clientId={id}
              clientName={client.name}
              groups={[{ name: "Projects", projects: live }]}
              canManage={isAdmin}
              canInvite={inviteRoles.length > 0}
              onInvite={() => setInviting(true)}
            />
          </div>
        </section>
      )}
      {inviting && agency && (
        <InviteMemberModal
          agencyId={agency.agencyId}
          roles={inviteRoles}
          presetClientId={id}
          onClose={() => setInviting(false)}
          onSent={() => {}}
        />
      )}
    </div>
  );
}
