"use client";

import { use, useEffect, useState } from "react";
import { SettingsHead } from "@/components/settings/SettingsHead";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { addToSlackUrl, useDisconnectSlack, useSlackConfigured, useSlackConnection } from "@/hooks/use-slack";
import { seesAllClients } from "@/lib/roles";

const RETURN = "/settings/connections/slack";

const OUTCOMES: Record<string, { text: string; error?: boolean }> = {
  connected: { text: "Slack connected. Choose each project's channel in its Settings." },
  cancelled: { text: "Adding Frank to Slack was cancelled. Nothing changed.", error: true },
  not_allowed: { text: "Only Owners and Admins can connect Slack.", error: true },
  not_configured: { text: "Slack isn't set up on Frank here yet.", error: true },
  failed: { text: "Slack didn't connect.", error: true },
};

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

// Settings → Connections → Slack (phase154, direct instruction): the
// workspace's Slack, connected once by an Owner or Admin with Add to Slack.
// Each project then posts to a channel chosen in its Settings.
export default function SlackConnectionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = use(searchParams);
  const { data: agency } = useMyAgency();
  const { data: me } = useMyMembership(agency?.agencyId);
  const isAdmin = !!me && !me.client_id && seesAllClients(me.role);
  const { data: configured } = useSlackConfigured();
  const { data: conn, isLoading } = useSlackConnection(agency?.agencyId);
  const disconnect = useDisconnectSlack(agency?.agencyId);
  const [asking, setAsking] = useState(false);
  // What came back from Slack, read once; the address is then tidied so a
  // reload doesn't repeat it.
  const [outcome] = useState<{ text: string; error?: boolean } | null>(() => {
    const key = typeof params.slack === "string" ? params.slack : null;
    if (!key) return null;
    const base = OUTCOMES[key] ?? OUTCOMES.failed;
    const detail = typeof params.detail === "string" ? params.detail : null;
    return { ...base, text: detail ? `${base.text} ${detail}` : base.text };
  });
  useEffect(() => {
    if (params.slack) window.history.replaceState(null, "", RETURN);
  }, [params.slack]);

  return (
    <div className="pad" style={{ maxWidth: 1100 }}>
      <SettingsHead
        title="Slack"
        description="Post each project's client activity and team comments to a Slack channel. Connect your Slack once here, then choose each project's channel in its Settings."
      />
      {configured === false && (
        <div className="note warn" style={{ marginBottom: 16 }}>
          <div>Slack isn&rsquo;t set up on Frank here yet, so it can&rsquo;t be connected.</div>
        </div>
      )}
      {outcome && (
        <p className={outcome.error ? "autherr" : "bsaved"} role="status" style={{ marginBottom: 12 }}>
          {outcome.text}
        </p>
      )}
      {isLoading && <p className="sub">Frank is working…</p>}
      {!isLoading && (
        <section className="panel" aria-label="Slack">
          <div className="srow">
            <span className="sl">
              <b>{conn ? conn.team_name : "Not connected"}</b>
              <span>
                {conn
                  ? `Connected by ${conn.connected_by_name ?? "someone"} on ${when(conn.connected_at)}. Frank posts to public channels as it is; for a private one, invite it there with /invite @Frank.`
                  : "Add to Slack asks you to approve Frank in your Slack workspace."}
              </span>
            </span>
            {conn && <span className="tag green">Connected</span>}
            {isAdmin && agency && (
              <span className="igacts">
                {configured && (
                  <a className="btn sm primary" href={addToSlackUrl(agency.agencyId)}>
                    {conn ? "Reconnect" : "Add to Slack"}
                  </a>
                )}
                {conn && (
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => {
                      disconnect.reset();
                      setAsking(true);
                    }}
                  >
                    Disconnect
                  </button>
                )}
              </span>
            )}
          </div>
        </section>
      )}
      {!isAdmin && me && <p className="sub">Owners and Admins connect Slack.</p>}
      {asking && (
        <ConfirmDialog
          title="Disconnect Slack?"
          message="Frank stops posting to every project's channel. Each project keeps its channel, for when you connect again."
          confirmLabel="Disconnect"
          pendingLabel="Disconnecting…"
          tone="danger"
          isPending={disconnect.isPending}
          error={disconnect.error}
          errorFallback="Couldn't disconnect"
          onConfirm={() => disconnect.mutate(undefined, { onSuccess: () => setAsking(false) })}
          onClose={() => setAsking(false)}
        />
      )}
    </div>
  );
}
