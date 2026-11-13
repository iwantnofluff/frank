-- Phase 155 — a Slack List for each project, beside its channel.
--
-- Decided directly (13 Nov 2026): a project can connect one of the
-- workspace's Slack Lists (by its link, as Slack offers no way to list
-- them), and the same things that go to its channel can each become an item
-- there, with the List's own three switches. Frank reads the List's columns
-- when it's connected and remembers the ones it fills: the first (title)
-- column, and any named Post, Client, Comment, Link or From. Owners and
-- Admins choose; the team sees it. (Mentions tagged in a channel's post
-- need no schema: the app looks people up in Slack by email.)

create table project_slack_list (
  project_id uuid primary key references projects (id) on delete cascade,
  agency_id uuid not null references agencies (id) on delete cascade,
  list_id text not null check (list_id ~ '^F[A-Z0-9]{6,20}$'),
  list_title text not null check (length(list_title) between 1 and 200),
  -- { "title": { "id": "Col…", "type": "text" }, "post": {…}, … }
  columns jsonb not null default '{}',
  client_activity boolean not null default true,
  team_comments boolean not null default true,
  include_private boolean not null default true,
  last_error text,
  last_error_at timestamptz,
  set_by uuid references users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger project_slack_list_set_agency_id
  before insert or update of project_id on project_slack_list
  for each row execute function set_agency_id_from_project();
create trigger zz_read_only_guard before insert or update or delete on project_slack_list
  for each row execute function block_writes_when_read_only();

alter table project_slack_list enable row level security;
create policy project_slack_list_select on project_slack_list
  for select using (is_agency_staff(agency_id) and project_id in (select staff_visible_project_ids(agency_id)));
create policy project_slack_list_insert on project_slack_list
  for insert with check (is_agency_admin(agency_id) and project_id in (select staff_visible_project_ids(agency_id)));
create policy project_slack_list_update on project_slack_list
  for update using (is_agency_admin(agency_id) and project_id in (select staff_visible_project_ids(agency_id)))
  with check (is_agency_admin(agency_id) and project_id in (select staff_visible_project_ids(agency_id)));
create policy project_slack_list_delete on project_slack_list
  for delete using (is_agency_admin(agency_id) and project_id in (select staff_visible_project_ids(agency_id)));

-- Where each thing owed goes: the channel (phase154), or the List.
alter table slack_outbox add column if not exists target text not null default 'channel'
  check (target in ('channel', 'list'));

-- Owed to the channel and the List alike, each by its own switches.
create or replace function slack_queue(p_creative_id uuid, p_kind text, p_comment_id uuid, p_private boolean default false)
returns void
language sql security definer set search_path = public, extensions as $$
  insert into slack_outbox (agency_id, project_id, creative_id, comment_id, kind, target)
  select c.agency_id, c.project_id, c.id, p_comment_id, p_kind, 'channel'
  from creatives c
  join project_slack ps on ps.project_id = c.project_id
  join slack_connections sc on sc.agency_id = c.agency_id
  where c.id = p_creative_id
    and case when p_kind = 'team_comment' then ps.team_comments and (ps.include_private or not p_private)
             else ps.client_activity end;
  insert into slack_outbox (agency_id, project_id, creative_id, comment_id, kind, target)
  select c.agency_id, c.project_id, c.id, p_comment_id, p_kind, 'list'
  from creatives c
  join project_slack_list pl on pl.project_id = c.project_id
  join slack_connections sc on sc.agency_id = c.agency_id
  where c.id = p_creative_id
    and case when p_kind = 'team_comment' then pl.team_comments and (pl.include_private or not p_private)
             else pl.client_activity end;
$$;
revoke execute on function slack_queue(uuid, text, uuid, boolean) from public, anon, authenticated;

notify pgrst, 'reload schema';
