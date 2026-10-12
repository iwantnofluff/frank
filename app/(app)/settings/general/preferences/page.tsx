"use client";

import { SettingsHead } from "@/components/settings/SettingsHead";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { useAgencySettings, useSaveNotificationKeep, useSaveReviewApprovedDays } from "@/hooks/use-agency-settings";
import { seesAllClients } from "@/lib/roles";
import { errorMessage } from "@/lib/errors";

// Settings → General → Preferences (direct instruction; was Notifications),
// for the whole workspace, in sections: how long the bell keeps a
// notification once it's been read (phase90; unread ones always stay), and
// how far back a review link lists Approved posts (phase92). Owners and
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

  return (
    <div className="pad" style={{ maxWidth: 1100 }}>
      <SettingsHead title="Preferences" description="How your workspace's bell and review links behave, for everyone in it." />
      {me && !canEdit && <p className="note">Only Owners and Admins can change this.</p>}
      {(save.error || saveApproved.error) && (
        <p className="autherr">{errorMessage(save.error ?? saveApproved.error, "Couldn't save that change")}</p>
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
    </div>
  );
}
