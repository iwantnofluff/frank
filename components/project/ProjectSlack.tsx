"use client";

import Link from "next/link";
import { useState } from "react";
import {
  useConnectSlackList,
  useProjectSlack,
  useProjectSlackList,
  useRemoveProjectSlack,
  useRemoveProjectSlackList,
  useSaveProjectSlack,
  useSaveProjectSlackList,
  useSlackChannels,
  useSlackConnection,
} from "@/hooks/use-slack";
import { errorMessage } from "@/lib/errors";

type Switches = { client_activity: boolean; team_comments: boolean; include_private: boolean };

// What goes to a channel or a List: the same three switches for each.
function SlackSwitches({
  label,
  values,
  disabled,
  onChange,
}: {
  label: string;
  values: Switches;
  disabled: boolean;
  onChange: (patch: Partial<Switches>) => void;
}) {
  const one = (key: keyof Switches, name: string, hint: string, off = false) => (
    <label className="ps-hide slk-tog">
      <input type="checkbox" checked={values[key]} disabled={disabled || off} onChange={(e) => onChange({ [key]: e.target.checked })} />
      <span>
        <b>{name}</b> {hint}
      </span>
    </label>
  );
  return (
    <div className="slk-togs" role="group" aria-label={label}>
      {one("client_activity", "Client activity", "— the client's comments, change requests and approvals.")}
      {one("team_comments", "Team comments", "— your team's comments on this project's posts.")}
      {one(
        "include_private",
        "Include Private comments",
        "— everyone who can see it sees them. Turn off if it's shared with people outside your team.",
        !values.team_comments,
      )}
    </div>
  );
}

// Project Settings → Slack (phase154, direct instruction): the channel this
// project's client activity and team comments go to, and which of them; and
// a List each can become an item in (phase155). Owners and Admins choose;
// the team sees it. Needs the workspace's Slack connected first (Settings →
// Connections → Slack).
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

  return (
    <>
      <div className="msection-h">Slack</div>
      <p className="msection-d">
        Post this project&rsquo;s client activity and team comments to a Slack channel, and add them to a Slack List.
        {canManage ? " Changes save as they're made." : " Owners and Admins choose."}
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
          <div className="slk-sub">Channel</div>
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
            <SlackSwitches label="What goes to the channel" values={setting} disabled={!canManage || busy} onChange={(patch) => save.mutate(patch)} />
          )}
          {setting?.last_error && <p className="autherr">{setting.last_error}</p>}
          {error && <p className="autherr">{errorMessage(error, "Couldn't save that")}</p>}

          <ProjectSlackList projectId={projectId} agencyId={agencyId} canManage={canManage} />
        </div>
      )}
    </>
  );
}

// The column names Frank fills, as it found them in the List, in this
// order (the database keeps the found columns in its own).
const FILLS: Record<string, string> = { title: "its first column", post: "Post", client: "Client", comment: "Comment", link: "Link", from: "From" };

// A List for the project (phase155): connected by its link (Slack has no
// way to list a workspace's Lists), each thing that's switched on becoming
// an item in it.
function ProjectSlackList({ projectId, agencyId, canManage }: { projectId: string; agencyId: string; canManage: boolean }) {
  const { data: list, isLoading } = useProjectSlackList(projectId);
  const connect = useConnectSlackList(projectId, agencyId);
  const save = useSaveProjectSlackList(projectId);
  const remove = useRemoveProjectSlackList(projectId);
  const [editing, setEditing] = useState(false);
  const [link, setLink] = useState("");
  const busy = connect.isPending || save.isPending || remove.isPending;
  const error = connect.error ?? save.error ?? remove.error;
  const asking = canManage && (editing || (!list && !isLoading));

  return (
    <>
      <div className="slk-sub">List</div>
      {isLoading && <p className="sub">Frank is working…</p>}
      {list && !editing && (
        <>
          <div className="slk-row">
            <span>
              Adding items to <b>{list.list_title}</b>
              <span className="slk-fills">
                Fills {Object.keys(FILLS).filter((k) => list.columns[k]).map((k) => FILLS[k]).join(", ")}
              </span>
            </span>
            {canManage && (
              <span className="ps-acts">
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => {
                    connect.reset();
                    setLink("");
                    setEditing(true);
                  }}
                >
                  Change List
                </button>
                <button type="button" className="pr-link" disabled={busy} onClick={() => remove.mutate()}>
                  Stop Adding
                </button>
              </span>
            )}
          </div>
          <SlackSwitches label="What goes to the List" values={list} disabled={!canManage || busy} onChange={(patch) => save.mutate(patch)} />
          {list.last_error && <p className="autherr">{list.last_error}</p>}
        </>
      )}
      {!list && !isLoading && !canManage && <p className="sub">No List yet.</p>}
      {asking && (
        <div className="slk-pick">
          <span className="sub">
            In Slack, open the List, then ⋯ → Copy link. Frank fills its first column, and any named Post, Client, Comment, Link
            or From; your other columns are left for your team.
          </span>
          <input
            className="bin one"
            placeholder="https://yourteam.slack.com/lists/T…/F…"
            aria-label="Slack List link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && editing) {
                e.stopPropagation();
                setEditing(false);
              }
            }}
          />
          <span className="ps-acts">
            <button
              type="button"
              className="btn primary sm"
              disabled={!link.trim() || busy}
              onClick={() => connect.mutate(link.trim(), { onSuccess: () => setEditing(false) })}
            >
              {connect.isPending ? "Checking…" : "Connect List"}
            </button>
            {editing && (
              <button type="button" className="btn sm" onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
          </span>
        </div>
      )}
      {error && <p className="autherr">{errorMessage(error, "Couldn't connect that List")}</p>}
    </>
  );
}
