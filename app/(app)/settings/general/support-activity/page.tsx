"use client";

import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { useSupportLog } from "@/hooks/use-support-log";
import { SettingsHead } from "@/components/settings/SettingsHead";
import { isOwnerOrAbove } from "@/lib/roles";
import { errorMessage } from "@/lib/errors";

// Settings → General → Support Activity (phase51): everything Frank's
// support has done in this agency, and why. For Owners, so acting inside
// their account is never invisible to them.
export default function SupportActivityPage() {
  const { data: agency } = useMyAgency();
  const { data: me } = useMyMembership(agency?.agencyId);
  const isOwner = me?.client_id === null && isOwnerOrAbove(me?.role);
  const { data: log, isLoading, error } = useSupportLog(isOwner ? agency?.agencyId : undefined);

  return (
    <>
      <SettingsHead
        title="Support Activity"
        description="Anything Frank's support team has done in your account, with the reason they gave."
      />
      {me && !isOwner && <p className="sub">Only Owners can see this.</p>}
      {isOwner && isLoading && <p className="sub">Loading…</p>}
      {error && <p className="autherr">{errorMessage(error, "Couldn't load the support activity")}</p>}
      {log && log.length === 0 && <p className="sub">Nothing yet. Frank&rsquo;s support hasn&rsquo;t changed anything in {agency?.name}.</p>}
      {log && log.length > 0 && (
        <section className="panel" aria-label="Support activity">
          {log.map((a) => (
            <div className="srow" key={a.id}>
              <span className="sl">
                <b>
                  {a.action}
                  {a.target ? `: ${a.target}` : ""}
                </b>
                <span>
                  {a.detail ? `${a.detail.replace(/\.$/, "")}. ` : ""}Why: {a.reason}
                </span>
              </span>
              <span className="srow-note">
                {a.actor_name}, Frank
                <br />
                {new Date(a.created_at).toLocaleString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
