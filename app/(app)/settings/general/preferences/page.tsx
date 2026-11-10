"use client";

import { SettingsHead } from "@/components/settings/SettingsHead";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { useAgencySettings, useSaveNotificationKeep, useSaveReviewApprovedDays } from "@/hooks/use-agency-settings";
import { seesAllClients } from "@/lib/roles";
import { errorMessage } from "@/lib/errors";
import Link from "next/link";
import { useClients } from "@/hooks/use-clients";
import { isSampleKept, useAddSample, useKeepSample } from "@/hooks/use-sample";
import { SampleBanner } from "@/components/clients/SampleBanner";

// Settings → General → Preferences (direct instruction; was Notifications),
// for the whole workspace, in sections: how long the bell keeps a
// notification once it's been read (phase90; unread ones always stay), and
// how far back a review link lists Approved posts (phase92), and the sample
// client: add it, keep it, or let it go (phase145). Owners and
// Admins change them; each saves the moment it's picked, as a client's
// Preferences do.
export default function PreferencesSettingsPage() {
  const { data: agency } = useMyAgency();
  const { data: me } = useMyMembership(agency?.agencyId);
  const canEdit = !!me && !me.client_id && seesAllClients(me.role);
  const { data: settings, isLoading } = useAgencySettings(agency?.agencyId);
  const save = useSaveNotificationKeep(agency?.agencyId);
  const days = save.isPending ? save.variables : (settings?.notification_keep_days ?? 90);
  const saveApproved = useSaveReviewApprovedDays(agency?.agencyId);
  // 14 where the workspace has no settings yet (phase92's default).
  const approvedDays = saveApproved.isPending
    ? saveApproved.variables
    : settings
      ? settings.review_approved_days
      : 14;
  // The sample client (direct instruction): add one, keep it, or have it go.
  const { data: clients } = useClients();
  const sample = clients?.find((c) => c.is_sample) ?? null;
  const addSample = useAddSample(agency?.agencyId);
  const keepSample = useKeepSample();
  const kept = keepSample.isPending ? keepSample.variables.keep : isSampleKept(sample?.sample_expires_at);

  return (
    <div className="pad" style={{ maxWidth: 1100 }}>
      <SettingsHead title="Preferences" description="How your workspace's bell, review links and sample client behave, for everyone in it." />
      {me && !canEdit && <p className="note">Only Owners and Admins can change this.</p>}
      {(save.error || saveApproved.error || keepSample.error) && (
        <p className="autherr">{errorMessage(save.error ?? saveApproved.error ?? keepSample.error, "Couldn't save that change")}</p>
      )}
      <section className="panel">
        <div className="panel-h">
          <b>Notifications</b>
          {save.isSuccess && !save.isPending && <span className="sync">Saved</span>}
        </div>
        <div className="srow">
          <span className="sl">
            <b>Keep read notifications for</b>
            <span>Once read, a notification leaves everyone&rsquo;s bell after this long. Unread ones always stay.</span>
          </span>
          <select
            aria-label="Keep read notifications for"
            value={days}
            disabled={!canEdit || isLoading}
            onChange={(e) => save.mutate(Number(e.target.value) as 30 | 60 | 90)}
          >
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
        </div>
      </section>
      <section className="panel">
        <div className="panel-h">
          <b>Review Links</b>
          {saveApproved.isSuccess && !saveApproved.isPending && <span className="sync">Saved</span>}
        </div>
        <div className="srow">
          <span className="sl">
            <b>List Approved posts for</b>
            <span>
              How far back a review link&rsquo;s Approved list goes, so it stays short. A link always keeps the posts it was
              sent for.
            </span>
          </span>
          <select
            aria-label="List Approved posts for"
            value={approvedDays === null ? "always" : approvedDays}
            disabled={!canEdit || isLoading}
            onChange={(e) =>
              saveApproved.mutate(e.target.value === "always" ? null : (Number(e.target.value) as 7 | 14 | 21 | 28))
            }
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={21}>21 days</option>
            <option value={28}>28 days</option>
            <option value="always">Always</option>
          </select>
        </div>
      </section>
      <section className="panel">
        <div className="panel-h">
          <b>Sample Client</b>
          {keepSample.isSuccess && !keepSample.isPending && <span className="sync">Saved</span>}
        </div>
        {sample ? (
          <>
            <div className="srow">
              <span className="sl">
                <b>
                  <Link href={`/clients/${sample.id}`}>{sample.name}</Link>
                </b>
                <span>Keep it to show people around, or have it removed with everything in it.</span>
              </span>
              <select
                aria-label="Sample client"
                value={kept ? "keep" : "remove"}
                disabled={!canEdit || keepSample.isPending}
                onChange={(e) => keepSample.mutate({ clientId: sample.id, keep: e.target.value === "keep" })}
              >
                <option value="remove">Remove after 7 days</option>
                <option value="keep">Keep it</option>
              </select>
            </div>
            <div className="srow">
              <SampleBanner clientId={sample.id} />
            </div>
          </>
        ) : (
          <div className="srow">
            <span className="sl">
              <b>Lumen Skin</b>
              <span>
                A made-up skincare client with a Content Planner and posts at every stage, some with artwork and client comments,
                to explore Frank with. It doesn&rsquo;t count towards your plan, and is removed after 7 days unless you keep it.
              </span>
              {addSample.error && <span className="autherr">{errorMessage(addSample.error, "Couldn't add the sample client")}</span>}
            </span>
            {canEdit && (
              <button type="button" className="btn sm" disabled={addSample.isPending || !clients} onClick={() => addSample.mutate()}>
                {addSample.isPending ? "Adding…" : "Add the Sample Client"}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
