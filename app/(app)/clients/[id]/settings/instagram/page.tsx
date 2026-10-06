"use client";

import { use, useEffect, useState } from "react";
import { SettingsHead } from "@/components/settings/SettingsHead";
import { useClientDetail } from "@/hooks/use-client";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import {
  connectUrl,
  useCreateConnectLink,
  useDisconnectInstagram,
  useInstagramConfigured,
  useInstagramConnections,
} from "@/hooks/use-instagram";
import { seesAllClients } from "@/lib/roles";
import { errorMessage } from "@/lib/errors";

const OUTCOMES: Record<string, { text: string; error?: boolean }> = {
  connected: { text: "Instagram connected. Its posts now show in the Feed Preview." },
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

// Client Settings → Instagram (direct instruction): this client's account
// for the live feed (phase54), as Settings → Connections → Instagram shows
// it for every client. Owners and Admins connect, send a link, reconnect
// or disconnect; everyone else sees where it stands.
export default function ClientInstagramPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = use(params);
  const query = use(searchParams);
  const returnPath = `/clients/${id}/settings/instagram`;
  const { data: client } = useClientDetail(id);
  const { data: agency } = useMyAgency();
  const { data: me } = useMyMembership(agency?.agencyId);
  const isAdmin = !!me && !me.client_id && seesAllClients(me.role);
  const { data: connections, isLoading } = useInstagramConnections();
  const { data: configured } = useInstagramConfigured();
  const disconnect = useDisconnectInstagram();
  const makeLink = useCreateConnectLink();
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [outcome] = useState<{ text: string; error?: boolean } | null>(() => {
    const key = typeof query.instagram === "string" ? query.instagram : null;
    if (!key) return null;
    const base = OUTCOMES[key] ?? OUTCOMES.failed;
    const detail = typeof query.detail === "string" ? query.detail : null;
    return { ...base, text: detail ? `${base.text} ${detail}` : base.text };
  });
  useEffect(() => {
    if (query.instagram) window.history.replaceState(null, "", returnPath);
  }, [query.instagram, returnPath]);

  const conn = (connections ?? []).find((c) => c.client_id === id) ?? null;

  return (
    <div className="pad narrow">
      <SettingsHead
        title="Instagram"
        description={`Connect ${client?.name ?? "this client"}'s Instagram so its Feed Preview shows the real posts beside the planned ones. Business and Creator accounts only.`}
      />
      {configured === false && (
        <div className="note warn" style={{ marginBottom: 16 }}>
          <div>Instagram isn&rsquo;t set up on Frank here yet, so accounts can&rsquo;t be connected.</div>
        </div>
      )}
      {configured && isAdmin && !conn && (
        <p className="sub igtip">
          Connect uses the Instagram account this browser is signed into at instagram.com. Sign into the client&rsquo;s
          account there first, or use Send Link so they connect it themselves.
        </p>
      )}
      {outcome && (
        <p className={outcome.error ? "autherr" : "bsaved"} role="status" style={{ marginBottom: 12 }}>
          {outcome.text}
        </p>
      )}
      {isLoading ? (
        <p className="sub">Loading…</p>
      ) : (
        <section className="panel" aria-label="Instagram account">
          <div className="srow igrow">
            <span className="sl">
              <b>{conn ? `@${conn.username}` : "Not connected"}</b>
              {conn && (
                <span>
                  {conn.followers_count != null ? `${conn.followers_count.toLocaleString()} followers · ` : ""}connected by{" "}
                  {conn.connected_by_name ?? "someone"} on {when(conn.connected_at)}
                </span>
              )}
              {link && (
                <span className="iglink">
                  <input className="bin one" readOnly value={link} aria-label="Connect link" onFocus={(e) => e.target.select()} />
                  <button
                    type="button"
                    className="btn sm"
                    onClick={async () => {
                      await navigator.clipboard.writeText(link).catch(() => {});
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <span className="hint">Works once, for 7 days. They sign in to Instagram themselves.</span>
                </span>
              )}
            </span>
            {conn &&
              (conn.needs_reconnect_at ? (
                <span className="tag rose">Needs reconnecting</span>
              ) : (
                <span className="tag green">Connected</span>
              ))}
            {isAdmin && (configured || conn) && (
              <span className="igacts">
                {configured && (
                  <a className="btn sm primary" href={connectUrl(id, returnPath)}>
                    {conn ? "Reconnect" : "Connect"}
                  </a>
                )}
                {configured && !conn && (
                  <button
                    type="button"
                    className="btn sm"
                    disabled={makeLink.isPending}
                    onClick={() => makeLink.mutate(id, { onSuccess: (url) => setLink(url) })}
                  >
                    Send Link
                  </button>
                )}
                {conn && (
                  <button type="button" className="btn sm" disabled={disconnect.isPending} onClick={() => disconnect.mutate(conn.id)}>
                    Disconnect
                  </button>
                )}
              </span>
            )}
          </div>
        </section>
      )}
      {(disconnect.error || makeLink.error) && (
        <p className="autherr">{errorMessage(disconnect.error ?? makeLink.error, "Couldn't do that")}</p>
      )}
      {!isAdmin && me && <p className="sub">Owners and Admins connect accounts.</p>}
    </div>
  );
}
