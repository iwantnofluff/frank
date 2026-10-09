"use client";

import { SettingsHead } from "@/components/settings/SettingsHead";
import { useAdminNotifications, useSaveAdminNotification } from "@/hooks/use-admin-me";
import { ADMIN_NOTIFICATIONS, wantsNotification } from "@/lib/admin/notifications";
import { errorMessage } from "@/lib/errors";

// Which emails Frank sends this platform admin. Each saves as it's switched.
export default function AdminNotificationsPage() {
  const { data: prefs, isLoading } = useAdminNotifications();
  const save = useSaveAdminNotification();
  return (
    <div style={{ maxWidth: 760 }}>
      <SettingsHead title="Notifications" description="The emails Frank sends you about the workspaces on it." />
      <div className="panel">
        {!isLoading &&
          ADMIN_NOTIFICATIONS.map((n) => {
            const on = wantsNotification(prefs, n.key);
            return (
              <div className="srow" key={n.key}>
                <span className="sl">
                  <b>{n.label}</b>
                  <span>{n.hint}</span>
                </span>
                <button
                  type="button"
                  className="tog"
                  aria-pressed={on}
                  aria-label={n.label}
                  disabled={save.isPending}
                  onClick={() => save.mutate({ [n.key]: !on })}
                >
                  <i />
                </button>
              </div>
            );
          })}
      </div>
      {save.error && <p className="autherr">{errorMessage(save.error, "Couldn't save that")}</p>}
    </div>
  );
}
