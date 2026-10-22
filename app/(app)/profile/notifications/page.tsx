"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useIsStaff } from "@/hooks/use-is-staff";
import { useMyTips, useSetTipsEvery } from "@/hooks/use-tips";
import { TIP_EVERY_OPTIONS } from "@/lib/tips";
import { errorMessage } from "@/lib/errors";
import { SettingsHead } from "@/components/settings/SettingsHead";

export default function NotificationsPage() {
  // Tips are the team's: a client is taken to their Profile.
  const { isStaff, isPending } = useIsStaff();
  const router = useRouter();
  useEffect(() => {
    if (!isPending && !isStaff) router.replace("/profile");
  }, [isPending, isStaff, router]);
  return (
    <div className="pad narrow">
      <SettingsHead title="Notifications" description="What Frank shows you, and how often." />
      <NotificationSettings />
    </div>
  );
}

// Your own Notifications settings (direct instruction): how often a tip
// shows (phase116), once a day by default. The team only, as tips are.
function NotificationSettings() {
  const { isStaff, isPending } = useIsStaff();
  const enabled = isStaff && !isPending;
  const { data: tips, error } = useMyTips(enabled);
  const setEvery = useSetTipsEvery();
  if (!enabled) return null;
  return (
    <section className="panel" id="notifications">
      <div className="panel-h">
        <b>Tips</b>
        {setEvery.isSuccess && !setEvery.isPending && <span className="sync">Saved</span>}
      </div>
      {error && <p className="autherr">{errorMessage(error, "Couldn't load your notification settings")}</p>}
      {tips && (
        <div className="srow">
          <span className="sl">
            <b>Show tips</b>
            <span>A tip about something in Frank, top right for 5 seconds. Once a day is the first time you open Frank that day.</span>
          </span>
          <select
            aria-label="Show tips"
            value={tips.everyHours}
            disabled={setEvery.isPending}
            onChange={(e) => setEvery.mutate(Number(e.target.value))}
          >
            {TIP_EVERY_OPTIONS.map((o) => (
              <option key={o.hours} value={o.hours}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {setEvery.error && <p className="autherr">{errorMessage(setEvery.error, "Couldn't save that change")}</p>}
    </section>
  );
}
