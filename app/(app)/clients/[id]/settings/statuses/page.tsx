"use client";

import Link from "next/link";
import { use, useState } from "react";
import { SettingsHead } from "@/components/settings/SettingsHead";
import { StatusListEditor } from "@/components/settings/StatusListEditor";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useClients } from "@/hooks/use-clients";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { useClientOwnStatuses, useSetClientOwnStatuses } from "@/hooks/use-stage-statuses";
import { errorMessage } from "@/lib/errors";
import { seesAllClients } from "@/lib/roles";

// Client Settings → Statuses (phase151, direct instruction): the client
// uses the agency's statuses (Settings → Statuses) until it switches to its
// own, which start as a copy of the agency's. Switching back puts its posts
// on the agency's list, by name. Owners and Admins change them.
export default function ClientStatusesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: agency } = useMyAgency();
  const { data: me } = useMyMembership(agency?.agencyId);
  const canEdit = !!me && !me.client_id && seesAllClients(me.role);
  const { data: clients } = useClients();
  const name = clients?.find((c) => c.id === id)?.name ?? "This client";
  const { data: own, isLoading, error } = useClientOwnStatuses(id);
  const setOwn = useSetClientOwnStatuses(id);
  const [goingBack, setGoingBack] = useState(false);

  return (
    <div className="pad narrow">
      <SettingsHead
        title="Statuses"
        description="The steps this client's posts move through within each stage, for your team only. A post takes its stage's first when it gets there."
      />
      {isLoading && <p className="sub">Frank is working…</p>}
      {error && <p className="autherr">{errorMessage(error, "Couldn't load the statuses")}</p>}
      {me && !canEdit && <p className="note">Only Owners and Admins can change these.</p>}
      {setOwn.error && !goingBack && <p className="autherr">{errorMessage(setOwn.error, "Couldn't change that")}</p>}
      {own === false && (
        <section className="panel">
          <div className="panel-h">
            <b>Your Agency&rsquo;s Statuses</b>
          </div>
          <div className="srow">
            <span className="sl">
              <b>{name} uses your agency&rsquo;s statuses</b>
              <span>
                Changed in <Link className="inlink" href="/settings/general/statuses">Settings → Statuses</Link>, for every client using them.
                Its own start as a copy, which you can then change for {name} alone.
              </span>
            </span>
            {canEdit && (
              <button type="button" className="btn sm" disabled={setOwn.isPending} onClick={() => setOwn.mutate(true)}>
                {setOwn.isPending ? "Copying…" : "Use Its Own"}
              </button>
            )}
          </div>
        </section>
      )}
      {own === true && agency && (
        <>
          <section className="panel">
            <div className="panel-h">
              <b>Its Own Statuses</b>
            </div>
            <div className="srow">
              <span className="sl">
                <b>{name} has its own statuses</b>
                <span>
                  Changes to your agency&rsquo;s statuses don&rsquo;t reach it. Going back puts its posts on the
                  agency&rsquo;s status of the same name, or the stage&rsquo;s first.
                </span>
              </span>
              {canEdit && (
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => {
                    setOwn.reset();
                    setGoingBack(true);
                  }}
                >
                  Use the Agency&rsquo;s
                </button>
              )}
            </div>
          </section>
          <StatusListEditor list={{ agencyId: agency.agencyId, clientId: id }} canManage={canEdit} />
        </>
      )}
      {goingBack && (
        <ConfirmDialog
          title="Use the Agency's Statuses?"
          message={`${name}'s own statuses will be removed, and its posts moved to the agency's status of the same name, or the stage's first.`}
          confirmLabel="Use the Agency's"
          pendingLabel="Switching…"
          isPending={setOwn.isPending}
          error={setOwn.error}
          errorFallback="Couldn't switch"
          tone="danger"
          onConfirm={() => setOwn.mutate(false, { onSuccess: () => setGoingBack(false) })}
          onClose={() => setGoingBack(false)}
        />
      )}
    </div>
  );
}
