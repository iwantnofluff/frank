-- Phase 154 — Slack: a project's activity posted to its channel.
--
-- Decided directly (13 Nov 2026): a workspace connects Frank to its Slack
-- once (Add to Slack, Settings → Connections → Slack); each project picks a
-- channel, Owners and Admins only. What's posted: the client's activity (a
-- comment, a change request, an approval, feedback logged on their behalf)
-- and the team's comments, Private ones too unless the project turns them
-- off. The database decides what a channel is owed when it happens, here,
-- as it does for emails (phase80); the app posts it straight after
-- (app/api/notify/client-activity) and the daily run picks up anything left.

-- 1. The workspace's Slack: its bot's key, encrypted by the app, read only
-- by the server (no policies at all). The app learns what's connected
-- through slack_connection_status.
create table slack_connections (
  agency_id uuid primary key references agencies (id) on delete cascade,
  team_id text not null,
  team_name text not null,
  bot_token_enc text not null,
  connected_by uuid references users (id) on delete set null,
  connected_by_name text,
  connected_at timestamptz not null default now()
);
alter table slack_connections enable row level security;
revoke all on slack_connections from anon, authenticated;

create or replace function slack_connection_status(p_agency_id uuid)
returns table (team_name text, connected_by_name text, connected_at timestamptz)
language sql stable security definer set search_path = public, extensions as $$
  select team_name, connected_by_name, connected_at
  from slack_connections
  where agency_id = p_agency_id and is_agency_staff(p_agency_id);
$$;
revoke execute on function slack_connection_status(uuid) from public, anon;
grant execute on function slack_connection_status(uuid) to authenticated;

-- Disconnecting, by an Owner or Admin. Each project keeps its channel, for
-- when it's connected again; nothing's sent meanwhile.
create or replace function disconnect_slack(p_agency_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not is_agency_admin(p_agency_id) then
    raise exception 'Only Owners and Admins can disconnect Slack.';
  end if;
  delete from slack_connections where agency_id = p_agency_id;
end;
$$;
revoke execute on function disconnect_slack(uuid) from public, anon;
grant execute on function disconnect_slack(uuid) to authenticated;

-- 2. A project's channel, and what goes to it. The last thing Slack said
-- went wrong (not in the channel, the channel gone), for its Settings.
create table project_slack (
  project_id uuid primary key references projects (id) on delete cascade,
  agency_id uuid not null references agencies (id) on delete cascade,
  channel_id text not null check (length(channel_id) between 1 and 40),
  channel_name text not null check (length(channel_name) between 1 and 100),
  client_activity boolean not null default true,
  team_comments boolean not null default true,
  include_private boolean not null default true,
  last_error text,
  last_error_at timestamptz,
  set_by uuid references users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger project_slack_set_agency_id
  before insert or update of project_id on project_slack
  for each row execute function set_agency_id_from_project();
create trigger zz_read_only_guard before insert or update or delete on project_slack
  for each row execute function block_writes_when_read_only();

alter table project_slack enable row level security;
create policy project_slack_select on project_slack
  for select using (is_agency_staff(agency_id) and project_id in (select staff_visible_project_ids(agency_id)));
create policy project_slack_insert on project_slack
  for insert with check (is_agency_admin(agency_id) and project_id in (select staff_visible_project_ids(agency_id)));
create policy project_slack_update on project_slack
  for update using (is_agency_admin(agency_id) and project_id in (select staff_visible_project_ids(agency_id)))
  with check (is_agency_admin(agency_id) and project_id in (select staff_visible_project_ids(agency_id)));
create policy project_slack_delete on project_slack
  for delete using (is_agency_admin(agency_id) and project_id in (select staff_visible_project_ids(agency_id)));

-- 3. What a channel is owed, until it's posted. The server's only.
create table slack_outbox (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  creative_id uuid not null references creatives (id) on delete cascade,
  comment_id uuid references comments (id) on delete cascade,
  kind text not null check (kind in ('client_comment', 'changes_requested', 'client_approval', 'team_comment')),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  attempts int not null default 0,
  sent_at timestamptz,
  error text
);
create index slack_outbox_waiting on slack_outbox (creative_id, created_at) where sent_at is null;
alter table slack_outbox enable row level security;
revoke all on slack_outbox from anon, authenticated;

-- Owed to the post's project's channel, if it has one, the workspace is
-- connected, and the project wants this kind (and, for a team comment, a
-- Private one).
create or replace function slack_queue(p_creative_id uuid, p_kind text, p_comment_id uuid, p_private boolean default false)
returns void
language sql security definer set search_path = public, extensions as $$
  insert into slack_outbox (agency_id, project_id, creative_id, comment_id, kind)
  select c.agency_id, c.project_id, c.id, p_comment_id, p_kind
  from creatives c
  join project_slack ps on ps.project_id = c.project_id
  join slack_connections sc on sc.agency_id = c.agency_id
  where c.id = p_creative_id
    and case when p_kind = 'team_comment' then ps.team_comments and (ps.include_private or not p_private)
             else ps.client_activity end;
$$;
revoke execute on function slack_queue(uuid, text, uuid, boolean) from public, anon, authenticated;

-- A comment: the client's (on a review link, by their own people signed
-- in, or logged on their behalf), a change request with its words, or the
-- team's. An approval through a link is the approval's own message (4).
create or replace function comments_queue_slack()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_client boolean;
begin
  if new.deleted_at is not null then return new; end if;
  if new.author_id is null then
    if new.body = 'Approved via shared review link.' then return new; end if;
    v_client := true;
  else
    v_client := new.for_client or exists (
      select 1 from memberships m
      where m.agency_id = new.agency_id and m.user_id = new.author_id and m.client_id is not null
    );
  end if;
  if not v_client then
    perform slack_queue(new.creative_id, 'team_comment', new.id, new.visibility = 'private');
  -- Asked for changes in the same moment the comment was written.
  elsif exists (
    select 1 from creatives
    where id = new.creative_id and exception = 'changes_requested' and updated_at = now()
  ) then
    perform slack_queue(new.creative_id, 'changes_requested', new.id);
  else
    perform slack_queue(new.creative_id, 'client_comment', new.id);
  end if;
  return new;
end;
$$;
revoke execute on function comments_queue_slack() from public, anon, authenticated;

create trigger comments_queue_slack
  after insert on comments
  for each row execute function comments_queue_slack();

-- 4. An approval by the client, as the bell has it (phase102).
create or replace function creatives_queue_slack_approval()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.stage >= 5 and new.approved_at is not null
     and new.approved_at is distinct from old.approved_at
     and new.approved_by_email is not null
     and exists (
       select 1 from projects p join client_contacts cc on cc.client_id = p.client_id
       where p.id = new.project_id and cc.archived_at is null
         and lower(cc.email) = lower(new.approved_by_email)
     ) then
    perform slack_queue(new.id, 'client_approval', null);
  end if;
  return new;
end;
$$;
revoke execute on function creatives_queue_slack_approval() from public, anon, authenticated;

create trigger creatives_queue_slack_approval
  after update of approved_at on creatives
  for each row execute function creatives_queue_slack_approval();

-- 5. Sending (app/api/notify/client-activity, and the daily run): what's
-- waiting, claimed so two sends can't post one twice; tried up to five
-- times, for three days.
create or replace function claim_slack_outbox(p_creative_id uuid default null)
returns setof slack_outbox
language sql security definer set search_path = public, extensions as $$
  update slack_outbox set claimed_at = now(), attempts = attempts + 1
  where id in (
    select id from slack_outbox
    where sent_at is null and attempts < 5
      and (claimed_at is null or claimed_at < now() - interval '2 minutes')
      and (p_creative_id is null or creative_id = p_creative_id)
      and created_at > now() - interval '3 days'
    order by created_at
    limit 50
    for update skip locked
  )
  returning *;
$$;
revoke execute on function claim_slack_outbox(uuid) from public, anon, authenticated;
grant execute on function claim_slack_outbox(uuid) to service_role;

notify pgrst, 'reload schema';
