"use client";

import Link from "next/link";
import { useState } from "react";
import {
  useProjectSlack,
  useRemoveProjectSlack,
  useSaveProjectSlack,
  useSlackChannels,
  useSlackConnection,
  type ProjectSlack as ProjectSlackRow,
} from "@/hooks/use-slack";
import { errorMessage } from "@/lib/errors";

// Project Settings → Slack (phase154, direct instruction): the channel this
// project's client activity and team comments go to, and which of them.
// Owners and Admins choose; the team sees it. Needs the workspace's Slack
// connected first (Settings → Connections → Slack).
export function ProjectSlack({ projectId, agencyId, canManage }: { projectId: string; agencyId: string; canManage: boolean }) {
  const { data: conn, isLoading: connLoading } = useSlackConnection(agencyId);
  const { data: setting, isLoading } = useProjectSlack(projectId);
  const save = useSaveProjectSlack(projectId);
  const remove = useRemoveProjectSlack(projectId);
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState("");
  const channels = useSlackChannels(agencyId, picking);
  const busy = save.isPending || remove.isPending;
  const error = save.error ?? remove.error;

  const shown = (channels.data ?? []).filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase().replace(/^#/, "")));

  const toggle = (key: keyof Pick<ProjectSlackRow, "client_activity" | "team_comments" | "include_private">, label: string, hint: string, disabled = false) => (
    <label className="ps-hide slk-tog">
      <input
        type="checkbox"
        checked={!!setting?.[key]}
        disabled={!canManage || busy || disabled}
        onChange={(e) => save.mutate({ [key]: e.target.checked })}
      />
      <span>
        <b>{label}</b> {hint}
      </span>
    </label>
  );

  return (
    <>
      <div className="msection-h">Slack</div>
      <p className="msection-d">
        Post this project&rsquo;s client activity and team comments to a Slack channel.
        {canManage ? " Changes save as they're made." : " Owners and Admins choose the channel."}
      </p>
      {(connLoading || isLoading) && <p className="sub">Frank is working…</p>}
      {!connLoading && !conn && (
        <p className="sub">
          Slack isn&rsquo;t connected.{" "}
          {canManage ? (
            <>
              Connect it in <Link className="inlink" href="/settings/connections/slack">Settings → Connections → Slack</Link>.
            </>
          ) : (
            "An Owner or Admin connects it."
          )}
        </p>
      )}
      {conn && !isLoading && (
        <div className="slk">
          <div className="slk-row">
            <span>
              {setting ? (
                <>
                  Posting to <b>#{setting.channel_name}</b> in {conn.team_name}
                </>
              ) : (
                "No channel yet."
              )}
            </span>
            {canManage && !picking && (
              <span className="ps-acts">
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => {
                    save.reset();
                    setSearch("");
                    setPicking(true);
                  }}
                >
                  {setting ? "Change Channel" : "Choose Channel"}
                </button>
                {setting && (
                  <button type="button" className="pr-link" disabled={busy} onClick={() => remove.mutate()}>
                    Stop Posting
                  </button>
                )}
              </span>
            )}
          </div>

          {picking && (
            <div className="slk-pick">
              <input
                className="bin one"
                autoFocus
                placeholder="Search channels"
                aria-label="Search Slack channels"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    // Closes the list, not the Settings window.
                    e.stopPropagation();
                    setPicking(false);
                  }
                }}
              />
              {channels.isLoading && <p className="sub">Frank is working…</p>}
              {channels.error && <p className="autherr">{errorMessage(channels.error, "Couldn't list the channels")}</p>}
              {channels.data && (
                <div className="slk-list" role="listbox" aria-label="Slack channels">
                  {shown.map((c) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={setting?.channel_id === c.id}
                      key={c.id}
                      disabled={busy}
                      onClick={() =>
                        save.mutate({ channel_id: c.id, channel_name: c.name }, { onSuccess: () => setPicking(false) })
                      }
                    >
                      #{c.name}
                      {c.isPrivate && <span className="slk-priv">private</span>}
                    </button>
                  ))}
                  {!shown.length && <p className="sub">No channel by that name. For a private one, invite Frank there first.</p>}
                </div>
              )}
              <button type="button" className="btn sm" onClick={() => setPicking(false)}>
                Cancel
              </button>
            </div>
          )}

          {setting && (
            <div className="slk-togs">
              {toggle("client_activity", "Client activity", "— the client's comments, change requests and approvals.")}
              {toggle("team_comments", "Team comments", "— your team's comments on this project's posts.")}
              {toggle(
                "include_private",
                "Include Private comments",
                "— everyone in the channel sees them. Turn off if the channel includes people outside your team.",
                !setting.team_comments,
              )}
            </div>
          )}
          {setting?.last_error && <p className="autherr">{setting.last_error}</p>}
        </div>
      )}
      {error && <p className="autherr">{errorMessage(error, "Couldn't save that")}</p>}
    </>
  );
}
