"use client";

import { use, useState } from "react";
import { SettingsHead } from "@/components/settings/SettingsHead";
import { ClientDetailsEditor } from "@/components/clients/ClientSettingsParts";
import { useClientDetail } from "@/hooks/use-client";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { useAvatarUrls } from "@/hooks/use-avatar-urls";
import { useArchiveClient } from "@/hooks/use-archive-client";
import { seesAllClients } from "@/lib/roles";
import { initials } from "@/lib/initials";
import { errorMessage } from "@/lib/errors";

// Client Settings → Client Details (direct instruction: what the Client
// Profile window showed and edited). Owners and Admins edit in place
// (clients_details_admin_only) and archive; a User sees it read only.
export default function ClientDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: client, isLoading, error } = useClientDetail(id);
  const { data: agency } = useMyAgency();
  const { data: me } = useMyMembership(agency?.agencyId);
  const isAdmin = !!me && !me.client_id && seesAllClients(me.role);
  const { data: logoUrls } = useAvatarUrls([client?.logo_asset_id ?? null]);
  const logoUrl = client?.logo_asset_id ? (logoUrls?.[client.logo_asset_id] ?? null) : null;
  const archive = useArchiveClient();
  const [editing, setEditing] = useState(false);

  return (
    <div className="pad narrow">
      <SettingsHead title="Client Details" description="The client's name, logo, industry and description." />
      {isLoading && <p className="sub">Frank is working…</p>}
      {error && <p className="autherr">{errorMessage(error, "Couldn't load this client")}</p>}
      {client && agency && (
        <section className="panel">
          <div className="panel-h">
            <b>Details</b>
            {isAdmin && !editing && (
              <button type="button" className="btn sm" style={{ marginLeft: "auto" }} onClick={() => setEditing(true)}>
                Edit
              </button>
            )}
          </div>
          <div className="panel-b">
            {editing ? (
              <ClientDetailsEditor agencyId={agency.agencyId} client={client} onDone={() => setEditing(false)} />
            ) : (
              <>
                <div className="profclient">
                  <div className="logo" style={{ background: client.accent_colour || "#6B7280" }}>
                    {logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
                      <img src={logoUrl} alt="" />
                    ) : (
                      // Blank while a logo is on its way, not the initials first.
                      client.logo_asset_id ? null : initials(client.name, "?")
                    )}
                  </div>
                  <div className="pp-t">
                    <b>{client.name}</b>
                    <span>{client.industry || "No industry set"}</span>
                  </div>
                </div>
                <p className="profdesc">{client.description || "No description yet."}</p>
              </>
            )}
          </div>
        </section>
      )}
      {client && isAdmin && (
        <section className="panel">
          <div className="panel-h">
            <b>{client.archived_at ? "Archived" : "Archive"}</b>
          </div>
          <div className="panel-b">
            <p className="sub" style={{ marginBottom: 10 }}>
              {client.archived_at
                ? "This client is archived: hidden from the clients list unless Archived is chosen."
                : "Archiving hides this client from the clients list. Nothing is deleted, and it can be unarchived."}
            </p>
            <button
              type="button"
              className="btn"
              disabled={archive.isPending}
              onClick={() => archive.mutate({ clientId: client.id, archived: !client.archived_at })}
            >
              {client.archived_at ? "Unarchive" : "Archive"}
            </button>
            {archive.error && <p className="autherr">{errorMessage(archive.error, "Couldn't change that")}</p>}
          </div>
        </section>
      )}
    </div>
  );
}
