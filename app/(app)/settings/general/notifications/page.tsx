"use client";

import { SettingsHead } from "@/components/settings/SettingsHead";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { useAgencySettings, useSaveNotificationKeep } from "@/hooks/use-agency-settings";
import { seesAllClients } from "@/lib/roles";
import { errorMessage } from "@/lib/errors";

// Settings → General → Notifications (phase90, direct instruction): how
// long the bell keeps a notification once it's been read, for the whole
// workspace. Unread ones always stay. Owners and Admins change it; it
// saves the moment it's picked, as Preferences do.
export default function NotificationsSettingsPage() {
  const { data: agency } = useMyAgency();
  const { data: me } = useMyMembership(agency?.agencyId);
  const canEdit = !!me && !me.client_id && seesAllClients(me.role);
  const { data: settings, isLoading } = useAgencySettings(agency?.agencyId);
  const save = useSaveNotificationKeep(agency?.agencyId);
  const days = save.isPending ? save.variables : (settings?.notification_keep_days ?? 90);

  return (
    <div className="pad" style={{ maxWidth: 1100 }}>
      <SettingsHead title="Notifications" description="How long the bell keeps a notification once it's been read." />
      {me && !canEdit && <p className="note">Only Owners and Admins can change this.</p>}
      {save.error && <p className="autherr">{errorMessage(save.error, "Couldn't save that change")}</p>}
      <section className="panel">
        <div className="panel-h">
          <b>Read Notifications</b>
          {save.isSuccess && !save.isPending && <span className="sync">Saved</span>}
        </div>
        <div className="srow">
          <span className="sl">
            <b>Keep for</b>
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
    </div>
  );
}
