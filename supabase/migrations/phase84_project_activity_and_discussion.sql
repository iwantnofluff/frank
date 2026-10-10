-- Phase 84 — a project's Activity log and Discussion.
--
-- Decided directly (10 Oct 2026): a "…" menu on a project's page with its
-- Activity log (what happened, by whom, when), a Discussion for the team
-- (threads and replies), and its Settings. The team only: anyone on the
-- team who can see the project (staff_visible_project_ids), never its
-- client's people.
--
-- Activity log (decided directly: what's already recorded, plus a log from
-- now on): posts made, stage moves, artwork and copy versions, comments,
-- review links and approvals are read from where they're already kept
-- (project_activity_feed below), history included. What isn't kept anywhere
-- is recorded from now on in project_activity, by the database itself so
-- it can't be skipped or faked: a post's brief edited, archived, restored or
-- deleted; the project renamed, its details changed, archived or restored,
-- moved to a folder or another client; people given or losing access.
--
-- Discussion: a thread is a message with no parent; replies are one level
-- under it. You edit or delete your own (deleted ones keep their place,
-- marked deleted, so replies under them still read). @mentions (decided
-- directly) put a notice in the bell of whoever's mentioned, if they're on
-- the project's team.

-- 1. The log from now on.
create table project_activity (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  project_id uuid not null references projects (id) on delete cascade,
  -- The post, while it exists; its name is in detail either way.
  creative_id uuid references creatives (id) on delete set null,
  kind text not null check (kind in (
    'post_edited', 'post_archived', 'post_restored', 'post_deleted',
    'project_renamed', 'project_details', 'project_archived', 'project_restored',
    'project_folder', 'project_client', 'person_added', 'person_removed'
  )),
  detail jsonb not null default '{}',
  -- Who, when signed in (null for the system).
  by_user uuid references users (id) on delete set null,
  at timestamptz not null default now()
);
create index project_activity_project_at on project_activity (project_id, at desc);

alter table project_activity enable row level security;
create policy project_activity_select on project_activity
  for select using (project_id in (select staff_visible_project_ids(agency_id)));
-- Written by the triggers below only.

-- Records one entry, if the project's still there (not mid-delete).
create or replace function log_project_activity(p_project_id uuid, p_creative_id uuid, p_kind text, p_detail jsonb)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_agency uuid;
begin
  select agency_id into v_agency from projects where id = p_project_id;
  if v_agency is null then return; end if;
  insert into project_activity (agency_id, project_id, creative_id, kind, detail, by_user)
  values (
    v_agency, p_project_id,
    case when exists (select 1 from creatives where id = p_creative_id) then p_creative_id end,
    p_kind, p_detail, auth.uid()
  );
end;
$$;
revoke execute on function log_project_activity(uuid, uuid, text, jsonb) from public, anon, authenticated;

-- A post: its brief (and Text on Image) edited, archived or restored.
-- Stages, versions and approvals are already kept elsewhere.
create or replace function creatives_log_activity()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_fields text[] := '{}';
begin
  if tg_op = 'DELETE' then
    perform log_project_activity(old.project_id, null, 'post_deleted', jsonb_build_object('post', old.name));
    return old;
  end if;
  if old.archived_at is null and new.archived_at is not null then
    perform log_project_activity(new.project_id, new.id, 'post_archived', jsonb_build_object('post', new.name));
  elsif old.archived_at is not null and new.archived_at is null then
    perform log_project_activity(new.project_id, new.id, 'post_restored', jsonb_build_object('post', new.name));
  end if;
  if new.name is distinct from old.name then v_fields := array_append(v_fields, 'Name'); end if;
  if new.formats is distinct from old.formats or new.format is distinct from old.format then v_fields := array_append(v_fields, 'Format'); end if;
  if new.lead_user_id is distinct from old.lead_user_id then v_fields := array_append(v_fields, 'Lead'); end if;
  if new.concept is distinct from old.concept then v_fields := array_append(v_fields, 'Concept'); end if;
  if new.reference_urls is distinct from old.reference_urls then v_fields := array_append(v_fields, 'References'); end if;
  if new.slide_count is distinct from old.slide_count then v_fields := array_append(v_fields, 'Slides'); end if;
  if new.scheduled_at is distinct from old.scheduled_at then v_fields := array_append(v_fields, 'Live date'); end if;
  if new.due_on is distinct from old.due_on then v_fields := array_append(v_fields, 'Due date'); end if;
  if new.destination is distinct from old.destination then v_fields := array_append(v_fields, 'Destination'); end if;
  if new.slide_text is distinct from old.slide_text then v_fields := array_append(v_fields, 'Text on Image'); end if;
  if array_length(v_fields, 1) > 0 then
    perform log_project_activity(new.project_id, new.id, 'post_edited',
      jsonb_build_object('post', new.name, 'fields', to_jsonb(v_fields)));
  end if;
  return new;
end;
$$;
create trigger creatives_log_activity
  after update on creatives
  for each row execute function creatives_log_activity();
create trigger creatives_log_delete
  before delete on creatives
  for each row execute function creatives_log_activity();

-- The project itself.
create or replace function projects_log_activity()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_fields text[] := '{}';
begin
  if new.name is distinct from old.name then
    perform log_project_activity(new.id, null, 'project_renamed', jsonb_build_object('from', old.name, 'to', new.name));
  end if;
  if old.archived_at is null and new.archived_at is not null then
    perform log_project_activity(new.id, null, 'project_archived', '{}');
  elsif old.archived_at is not null and new.archived_at is null then
    perform log_project_activity(new.id, null, 'project_restored', '{}');
  end if;
  if new.type is distinct from old.type then v_fields := array_append(v_fields, 'Type'); end if;
  if new.due_on is distinct from old.due_on then v_fields := array_append(v_fields, 'Due date'); end if;
  if new.description is distinct from old.description then v_fields := array_append(v_fields, 'Description'); end if;
  if new.icon is distinct from old.icon then v_fields := array_append(v_fields, 'Picture'); end if;
  if array_length(v_fields, 1) > 0 then
    perform log_project_activity(new.id, null, 'project_details', jsonb_build_object('fields', to_jsonb(v_fields)));
  end if;
  if new.folder_id is distinct from old.folder_id then
    perform log_project_activity(new.id, null, 'project_folder',
      jsonb_build_object('folder', (select name from project_folders where id = new.folder_id)));
  end if;
  if new.client_id is distinct from old.client_id then
    perform log_project_activity(new.id, null, 'project_client',
      jsonb_build_object('from', (select name from clients where id = old.client_id), 'to', (select name from clients where id = new.client_id)));
  end if;
  return new;
end;
$$;
create trigger projects_log_activity
  after update on projects
  for each row execute function projects_log_activity();

-- People given or losing access to it.
create or replace function project_access_log_activity()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  r project_access;
  v_name text;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  select u.name into v_name from memberships m join users u on u.id = m.user_id where m.id = r.membership_id;
  perform log_project_activity(r.project_id, null,
    case when tg_op = 'DELETE' then 'person_removed' else 'person_added' end,
    jsonb_build_object('person', v_name));
  return r;
end;
$$;
create trigger project_access_log_activity
  after insert or delete on project_access
  for each row execute function project_access_log_activity();

-- 2. Everything, newest first: what's already kept and the log. Runs as
--    the caller, so each part is only what they could see anyway.
create or replace function project_activity_feed(p_project_id uuid, p_before timestamptz default null, p_limit int default 60)
returns table (at timestamptz, kind text, by_user uuid, by_name text, creative_id uuid, creative_name text, detail jsonb)
language sql stable security invoker set search_path = public, extensions as $$
  with posts as (
    select id, name, created_by, created_at, approved_by_name from creatives where project_id = p_project_id
  ),
  everything as (
    select c.created_at as at, 'post_created'::text as kind, c.created_by as by_user, null::text as by_guest,
           c.id as creative_id, c.name as creative_name, '{}'::jsonb as detail
    from posts c
    union all
    select e.at, 'stage', e.by_user, case when e.to_stage = 4 and e.by_user is null then c.approved_by_name end,
           c.id, c.name, jsonb_build_object('from', e.from_stage, 'to', e.to_stage, 'exception', e.exception)
    from creative_stage_events e join posts c on c.id = e.creative_id
    where e.from_stage is not null
    union all
    select v.created_at, 'artwork_version', v.created_by, null, c.id, c.name, jsonb_build_object('version', v.version_no)
    from creative_versions v join posts c on c.id = v.creative_id
    union all
    select v.created_at, 'copy_version', v.created_by, null, c.id, c.name, jsonb_build_object('version', v.version_no)
    from copy_versions v join posts c on c.id = v.creative_id
    union all
    select m.created_at, 'comment', m.author_id, m.guest_name, c.id, c.name,
           jsonb_build_object('internal', m.visibility = 'private', 'text', left(m.body, 140))
    from comments m join posts c on c.id = m.creative_id
    where m.deleted_at is null
    union all
    select m.resolved_at, 'comment_resolved', m.resolved_by, null, c.id, c.name, jsonb_build_object('text', left(m.body, 140))
    from comments m join posts c on c.id = m.creative_id
    where m.resolved_at is not null and m.deleted_at is null
    union all
    select l.created_at, 'link_shared', l.created_by, null, l.creative_id, (select name from posts where id = l.creative_id), '{}'::jsonb
    from shared_links l where l.project_id = p_project_id
    union all
    select l.revoked_at, 'link_revoked', null, null, l.creative_id, (select name from posts where id = l.creative_id), '{}'::jsonb
    from shared_links l where l.project_id = p_project_id and l.revoked_at is not null
    union all
    select a.at, a.kind, a.by_user, null, a.creative_id, coalesce((select name from posts where id = a.creative_id), a.detail->>'post'), a.detail
    from project_activity a where a.project_id = p_project_id
  )
  select e.at, e.kind, e.by_user, coalesce(u.name, e.by_guest), e.creative_id, e.creative_name, e.detail
  from everything e left join users u on u.id = e.by_user
  where p_before is null or e.at < p_before
  order by e.at desc
  limit least(greatest(p_limit, 1), 200);
$$;

-- 3. Who's on a project's team: Owners and Admins, and the Users given it.
--    Mentions go to these only. Asked by someone on it, its names too.
create or replace function project_team(p_project_id uuid)
returns setof uuid
language sql stable security definer set search_path = public, extensions as $$
  select m.user_id
  from projects p
  join memberships m on m.agency_id = p.agency_id and m.client_id is null
    and m.removed_at is null and m.accepted_at is not null
  where p.id = p_project_id
    and (
      m.role in ('primary_owner', 'owner', 'admin')
      or exists (select 1 from project_access pa where pa.membership_id = m.id and pa.project_id = p.id)
    );
$$;
revoke execute on function project_team(uuid) from public, anon, authenticated;

create or replace function project_team_members(p_project_id uuid)
returns table (user_id uuid, name text)
language sql stable security definer set search_path = public, extensions as $$
  select u.id, u.name
  from project_team(p_project_id) t join users u on u.id = t
  where exists (
    select 1 from projects p
    where p.id = p_project_id and p.id in (select staff_visible_project_ids(p.agency_id))
  )
  order by u.name;
$$;
revoke execute on function project_team_members(uuid) from public, anon;
grant execute on function project_team_members(uuid) to authenticated;

-- 4. The discussion.
create table project_discussion (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  project_id uuid not null references projects (id) on delete cascade,
  -- A reply's thread; null for a thread.
  parent_id uuid references project_discussion (id) on delete cascade,
  author_id uuid not null references users (id),
  body text not null check (length(trim(body)) > 0 and length(body) <= 5000),
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
create index project_discussion_project on project_discussion (project_id, created_at);

create trigger project_discussion_set_agency_id
  before insert or update of project_id on project_discussion
  for each row execute function set_agency_id_from_project();
create trigger zz_read_only_guard before insert or update or delete on project_discussion
  for each row execute function block_writes_when_read_only();

-- Written as whoever's signed in; a reply goes under a thread of the same
-- project; afterwards only the words (and mentions) change, or it's
-- deleted, by its author.
create or replace function project_discussion_guard()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    new.created_at := now();
    new.edited_at := null;
    new.deleted_at := null;
    if new.parent_id is not null and not exists (
      select 1 from project_discussion d
      where d.id = new.parent_id and d.project_id = new.project_id and d.parent_id is null
    ) then
      raise exception 'A reply goes under a thread in the same project';
    end if;
    return new;
  end if;
  if new.author_id <> old.author_id or new.project_id <> old.project_id
     or new.parent_id is distinct from old.parent_id or new.created_at <> old.created_at then
    raise exception 'Only a message''s words can change';
  end if;
  if old.deleted_at is not null then
    raise exception 'This message was deleted';
  end if;
  if new.body is distinct from old.body and new.deleted_at is null then
    new.edited_at := now();
  end if;
  return new;
end;
$$;
create trigger project_discussion_guard
  before insert or update on project_discussion
  for each row execute function project_discussion_guard();

alter table project_discussion enable row level security;
create policy project_discussion_select on project_discussion
  for select using (project_id in (select staff_visible_project_ids(agency_id)));
create policy project_discussion_insert on project_discussion
  for insert with check (project_id in (select staff_visible_project_ids(agency_id)));
create policy project_discussion_update on project_discussion
  for update using (author_id = auth.uid() and project_id in (select staff_visible_project_ids(agency_id)))
  with check (author_id = auth.uid());
-- Deleting is marking deleted (an update), so replies keep their thread.

-- Live on every open panel.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'project_discussion') then
    alter publication supabase_realtime add table project_discussion;
  end if;
end $$;

-- 5. Mentions in the bell: whoever's newly mentioned and on the team, not
--    the author.
alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('artwork_removal', 'client_comment', 'client_approval', 'discussion_mention'));
alter table notifications
  add column if not exists discussion_id uuid references project_discussion (id) on delete cascade;
create unique index if not exists notifications_one_per_mention
  on notifications (user_id, discussion_id) where discussion_id is not null;

create or replace function project_discussion_notify()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.deleted_at is not null then return new; end if;
  insert into notifications (agency_id, user_id, kind, discussion_id)
  select new.agency_id, m, 'discussion_mention', new.id
  from unnest(new.mentions) m
  where m <> new.author_id
    and (tg_op = 'INSERT' or not (m = any (old.mentions)))
    and m in (select project_team(new.project_id))
  on conflict do nothing;
  return new;
end;
$$;
create trigger project_discussion_notify
  after insert or update of mentions on project_discussion
  for each row execute function project_discussion_notify();

notify pgrst, 'reload schema';
