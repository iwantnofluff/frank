"use client";

import { use, useEffect, useState } from "react";
import { SettingsHead } from "@/components/settings/SettingsHead";
import { useClients } from "@/hooks/use-clients";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import {
  connectUrl,
  useCreateConnectLink,
  useDisconnectInstagram,
  useInstagramConfigured,
  useInstagramConnections,
  type InstagramConnection,
} from "@/hooks/use-instagram";
import { seesAllClients } from "@/lib/roles";
import { errorMessage } from "@/lib/errors";

const RETURN = "/settings/connections/instagram";

const OUTCOMES: Record<string, { text: string; error?: boolean }> = {
  connected: { text: "Instagram connected. Its posts now show in that client's Feed Preview." },
  cancelled: { text: "The Instagram sign-in was cancelled. Nothing changed.", error: true },
  not_professional: {
    text: "That's a personal Instagram account. Only Business or Creator accounts can be connected; switching is free in the Instagram app.",
    error: true,
  },
  not_allowed: { text: "Only Owners and Admins can connect an account.", error: true },
  not_configured: { text: "Instagram isn't set up on Frank here yet.", error: true },
  failed: { text: "Instagram didn't connect.", error: true },
};

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

// Settings → Connections → Instagram (phase54): each client's account, for
// the live feed in the Feed Preview. Owners and Admins connect it (signing
// in with the account), send the client a link to connect it themselves,
// reconnect, or disconnect. Everyone else sees where things stand.
export default function InstagramConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = use(searchParams);
  const { data: agency } = useMyAgency();
  const { data: me } = useMyMembership(agency?.agencyId);
  const isAdmin = !!me && !me.client_id && seesAllClients(me.role);
  const { data: clients } = useClients();
  const { data: connections, isLoading } = useInstagramConnections();
  const { data: configured } = useInstagramConfigured();
  const disconnect = useDisconnectInstagram();
  const makeLink = useCreateConnectLink();
  const [links, setLinks] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);
  // What came back from Instagram's sign-in, read once; the address is then
  // tidied so a reload doesn't repeat it.
  const [outcome] = useState<{ text: string; error?: boolean } | null>(() => {
    const key = typeof params.instagram === "string" ? params.instagram : null;
    if (!key) return null;
    const base = OUTCOMES[key] ?? OUTCOMES.failed;
    const detail = typeof params.detail === "string" ? params.detail : null;
    return { ...base, text: detail ? `${base.text} ${detail}` : base.text };
  });
  useEffect(() => {
    if (params.instagram) window.history.replaceState(null, "", RETURN);
  }, [params.instagram]);

  const active = (clients ?? []).filter((c) => !c.archived_at);
  const byClient = new Map((connections ?? []).map((c) => [c.client_id, c]));

  function status(c: InstagramConnection) {
    if (c.needs_reconnect_at) return <span className="tag rose">Needs reconnecting</span>;
    return <span className="tag green">Connected</span>;
  }

  return (
    <>
      <SettingsHead
        title="Instagram"
        description="Connect each client's Instagram so its Feed Preview shows the real posts beside the planned ones. Business and Creator accounts only."
      />
      {configured === false && (
        <div className="note warn" style={{ marginBottom: 16 }}>
          <div>Instagram isn&rsquo;t set up on Frank here yet, so accounts can&rsquo;t be connected.</div>
        </div>
      )}
      {configured && isAdmin && (
        <p className="sub igtip">
          Connect uses the Instagram account this browser is signed into at instagram.com. Sign into the client&rsquo;s
          account there first, or use Send Link so they connect it themselves. After connecting, check the username
          shown is the right one.
        </p>
      )}
      {outcome && (
        <p className={outcome.error ? "autherr" : "bsaved"} role="status" style={{ marginBottom: 12 }}>
          {outcome.text}
        </p>
      )}
      {isLoading && <p className="sub">Loading…</p>}
      {!isLoading && active.length === 0 && <p className="sub">No clients yet.</p>}
      {active.length > 0 && (
        <section className="panel" aria-label="Instagram accounts">
          {active.map((client) => {
            const conn = byClient.get(client.id);
            return (
              <div className="srow igrow" key={client.id}>
                <span className="sl">
                  <b>{client.name}</b>
                  {conn ? (
                    <span>
                      @{conn.username}
                      {conn.followers_count != null ? ` · ${conn.followers_count.toLocaleString()} followers` : ""} · connected
                      by {conn.connected_by_name ?? "someone"} on {when(conn.connected_at)}
                    </span>
                  ) : (
                    <span>Not connected</span>
                  )}
                  {links[client.id] && (
                    <span className="iglink">
                      <input
                        className="bin one"
                        readOnly
                        value={links[client.id]}
                        aria-label={`Connect link for ${client.name}`}
                        onFocus={(e) => e.target.select()}
                      />
                      <button
                        type="button"
                        className="btn sm"
                        onClick={async () => {
                          await navigator.clipboard.writeText(links[client.id]).catch(() => {});
                          setCopied(client.id);
                          setTimeout(() => setCopied((c) => (c === client.id ? null : c)), 2000);
                        }}
                      >
                        {copied === client.id ? "Copied" : "Copy"}
                      </button>
                      <span className="hint">Works once, for 7 days. They sign in to Instagram themselves.</span>
                    </span>
                  )}
                </span>
                {conn && status(conn)}
                {isAdmin && (configured || conn) && (
                  <span className="igacts">
                    {configured && (
                      <a className="btn sm primary" href={connectUrl(client.id, RETURN)}>
                        {conn ? "Reconnect" : "Connect"}
                      </a>
                    )}
                    {configured && !conn && (
                      <button
                        type="button"
                        className="btn sm"
                        disabled={makeLink.isPending}
                        onClick={() =>
                          makeLink.mutate(client.id, { onSuccess: (url) => setLinks((l) => ({ ...l, [client.id]: url })) })
                        }
                      >
                        Send Link
                      </button>
                    )}
                    {conn && (
                      <button
                        type="button"
                        className="btn sm"
                        disabled={disconnect.isPending}
                        onClick={() => disconnect.mutate(conn.id)}
                      >
                        Disconnect
                      </button>
                    )}
                  </span>
                )}
              </div>
            );
          })}
        </section>
      )}
      {(disconnect.error || makeLink.error) && (
        <p className="autherr">{errorMessage(disconnect.error ?? makeLink.error, "Couldn't do that")}</p>
      )}
      {!isAdmin && me && <p className="sub">Owners and Admins connect accounts.</p>}
    </>
  );
}
