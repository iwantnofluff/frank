-- Phase 151 — statuses for the agency and its clients, in every stage.
--
-- Decided directly (12 Nov 2026): the statuses within a stage (phase123)
-- move from each project's Settings to the agency's Settings (Statuses),
-- one list every client uses. A client can switch to its own list in its
-- Client Settings, starting as a copy of the agency's; the agency's later
-- changes then don't reach it, and switching back returns its posts to
-- the agency's list. Every stage can have statuses now, not just In
-- Production and Internal Review; the four new ones start empty. Still
-- the team's only (a client sees Client Review, never its statuses), and
-- Owners and Admins change them. Only Concept, In Production and Internal
-- Review can hide their posts (phase143): a client can't read statuses, so
-- a hidden post in a stage they see would still show to them.
--
-- Every project on live still had the default list (confirmed directly),
-- so posts keep their status by its stage and name.

create table stage_statuses (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id) on delete cascade,
  -- None: the agency's list. A client's own list otherwise.
  client_id uuid references clients (id) on delete cascade,
  -- 1 Concept to 6 Live (lib/stage-labels.ts STAGE).
  stage smallint not null check (stage between 1 and 6),
  label text not null check (length(trim(label)) between 1 and 40),
  position int not null default 0,
  hides_post boolean not null default false,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint stage_statuses_hides_check check (not hides_post or stage <= 3)
);

create index stage_statuses_list on stage_statuses (agency_id, client_id, stage, position);
create index stage_statuses_client on stage_statuses (client_id) where client_id is not null;

-- Whether a client uses its own list rather than the agency's.
alter table clients add column if not exists own_statuses boolean not null default false;

-- A client's statuses take the client's agency; once made, a status stays
-- in its list and its stage.
create or replace function stage_statuses_guard()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if tg_op = 'UPDATE' and (new.stage <> old.stage or new.client_id is distinct from old.client_id or new.agency_id <> old.agency_id) then
    raise exception 'A status stays in its own list and stage';
  end if;
  if new.client_id is not null then
    select agency_id into new.agency_id from clients where id = new.client_id;
  end if;
  return new;
end;
$$;

create trigger stage_statuses_guard
  before insert or update on stage_statuses
  for each row execute function stage_statuses_guard();
create trigger zz_read_only_guard before insert or update or delete on stage_statuses
  for each row execute function block_writes_when_read_only();

alter table stage_statuses enable row level security;
create policy stage_statuses_select on stage_statuses
  for select using (
    is_agency_staff(agency_id)
    and (client_id is null or client_id in (select staff_visible_client_ids(agency_id)))
  );
-- A client's own statuses only while it uses its own list.
create policy stage_statuses_insert on stage_statuses
  for insert with check (
    is_agency_admin(agency_id)
    and (client_id is null or (
      client_id in (select staff_visible_client_ids(agency_id))
      and exists (select 1 from clients c where c.id = client_id and c.own_statuses)
    ))
  );
create policy stage_statuses_update on stage_statuses
  for update using (
    is_agency_admin(agency_id)
    and (client_id is null or client_id in (select staff_visible_client_ids(agency_id)))
  )
  with check (
    is_agency_admin(agency_id)
    and (client_id is null or client_id in (select staff_visible_client_ids(agency_id)))
  );
create policy stage_statuses_delete on stage_statuses
  for delete using (
    is_agency_admin(agency_id)
    and (client_id is null or client_id in (select staff_visible_client_ids(agency_id)))
  );

-- Whose list a project's posts use: its client's, if the client has its
-- own; none (the agency's) otherwise.
create or replace function status_list_client(p_project_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, extensions
as $$
  select case when c.own_statuses then c.id end
  from projects p join clients c on c.id = p.client_id
  where p.id = p_project_id
$$;

-- Whether a status is in a project's list, for a stage.
create or replace function status_fits(p_status_id uuid, p_project_id uuid, p_stage smallint)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from stage_statuses s join projects p on p.id = p_project_id
    where s.id = p_status_id
      and s.agency_id = p.agency_id
      and s.client_id is not distinct from status_list_client(p_project_id)
      and s.stage = p_stage
  )
$$;

-- The stage's first status in a project's list.
create or replace function first_stage_status(p_project_id uuid, p_stage smallint)
returns uuid
language sql
stable
security definer
set search_path = public, extensions
as $$
  select s.id from stage_statuses s join projects p on p.id = p_project_id
  where s.agency_id = p.agency_id
    and s.client_id is not distinct from status_list_client(p_project_id)
    and s.stage = p_stage
  order by s.position, s.created_at
  limit 1
$$;

-- A post's status kept in step with its stage (phase124's rules, for every
-- stage): the first status when it enters a stage, or a new post's stage;
-- one already in a stage may be on the stage alone; and only ever a status
-- from its own list, for its own stage.
create or replace function creatives_keep_status()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if tg_op = 'UPDATE' and new.stage is distinct from old.stage and new.status_id is not distinct from old.status_id then
    -- Moved stage without choosing a status: the new stage's first.
    new.status_id := first_stage_status(new.project_id, new.stage::smallint);
  elsif new.status_id is null then
    -- A new post starts on the first; one already here may be on the
    -- stage alone.
    if tg_op = 'INSERT' then
      new.status_id := first_stage_status(new.project_id, new.stage::smallint);
    end if;
  elsif not status_fits(new.status_id, new.project_id, new.stage::smallint) then
    if tg_op = 'UPDATE' and new.status_id is distinct from old.status_id then
      raise exception 'That status isn''t one of this post''s stage';
    end if;
    new.status_id := first_stage_status(new.project_id, new.stage::smallint);
  end if;
  return new;
end;
$$;

-- Moving a post's status for the list changing under it isn't an edit
-- anyone made: its Last Activity stays (frank.quiet_status).
create or replace function creatives_stamp_update()
returns trigger
language plpgsql set search_path = public as $$
begin
  if current_setting('frank.quiet_status', true) = 'on' then
    return new;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), old.updated_by);
  return new;
end;
$$;

-- A project's posts on a status no longer in its list (its client changed
-- lists, or the project moved client): the status of the same name in the
-- stage, or the stage's first.
create or replace function restatus_project_posts(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_list uuid := status_list_client(p_project_id);
begin
  perform set_config('frank.quiet_status', 'on', true);
  update creatives cr
  set status_id = coalesce(
    (select n.id from stage_statuses o join stage_statuses n
       on n.stage = o.stage and lower(trim(n.label)) = lower(trim(o.label))
     where o.id = cr.status_id
       and n.agency_id = cr.agency_id and n.client_id is not distinct from v_list
     order by n.position, n.created_at
     limit 1),
    first_stage_status(cr.project_id, cr.stage::smallint))
  where cr.project_id = p_project_id
    and cr.status_id is not null
    and not status_fits(cr.status_id, cr.project_id, cr.stage::smallint);
  perform set_config('frank.quiet_status', '', true);
end;
$$;
revoke all on function restatus_project_posts(uuid) from public, anon, authenticated;

create or replace function projects_restatus_on_move()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform restatus_project_posts(new.id);
  return new;
end;
$$;

create trigger projects_restatus_on_move
  after update of client_id on projects
  for each row when (new.client_id is distinct from old.client_id)
  execute function projects_restatus_on_move();

-- A client switches to its own list (a copy of the agency's) or back to
-- the agency's, its posts following by name. Owners and Admins.
create or replace function set_client_own_statuses(p_client_id uuid, p_own boolean)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_agency uuid;
  v_own boolean;
  v_project uuid;
begin
  select agency_id, own_statuses into v_agency, v_own from clients where id = p_client_id;
  if v_agency is null
     or not is_agency_admin(v_agency)
     or not p_client_id in (select staff_visible_client_ids(v_agency)) then
    raise exception 'Only Owners and Admins can change a client''s statuses.';
  end if;
  if v_own = p_own then
    return;
  end if;

  update clients set own_statuses = p_own where id = p_client_id;
  if p_own then
    insert into stage_statuses (agency_id, client_id, stage, label, position, hides_post, created_by)
    select v_agency, p_client_id, stage, label, position, hides_post, auth.uid()
    from stage_statuses
    where agency_id = v_agency and client_id is null;
  end if;

  for v_project in select id from projects where client_id = p_client_id loop
    perform restatus_project_posts(v_project);
  end loop;

  if not p_own then
    delete from stage_statuses where client_id = p_client_id;
  end if;
end;
$$;
revoke all on function set_client_own_statuses(uuid, boolean) from public, anon;
grant execute on function set_client_own_statuses(uuid, boolean) to authenticated;

-- A status deleted: its posts move to the first left in its stage, in its
-- list.
create or replace function stage_statuses_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update creatives
  set status_id = (
    select id from stage_statuses
    where agency_id = old.agency_id and client_id is not distinct from old.client_id
      and stage = old.stage and id <> old.id
    order by position, created_at
    limit 1
  )
  where status_id = old.id;
  return old;
end;
$$;

create trigger stage_statuses_move_posts
  before delete on stage_statuses
  for each row execute function stage_statuses_before_delete();

-- Every agency starts with phase143's list.
create or replace function seed_agency_statuses(p_agency_id uuid)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  insert into stage_statuses (agency_id, stage, label, position, hides_post)
  values
    (p_agency_id, 2, 'In Progress (Content)', 0, false),
    (p_agency_id, 2, 'In Progress (Creative)', 1, false),
    (p_agency_id, 3, 'Internal QC (Copy)', 0, false),
    (p_agency_id, 3, 'Internal QC (Creative)', 1, false),
    (p_agency_id, 3, 'Hold', 2, false),
    (p_agency_id, 3, 'Cancel', 3, true)
$$;
revoke all on function seed_agency_statuses(uuid) from public, anon, authenticated;

create or replace function agencies_seed_statuses()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform seed_agency_statuses(new.id);
  return new;
end;
$$;

create trigger agencies_seed_statuses
  after insert on agencies
  for each row execute function agencies_seed_statuses();

select seed_agency_statuses(a.id)
from agencies a
where not exists (select 1 from stage_statuses s where s.agency_id = a.id and s.client_id is null);

-- Posts onto the agency's list, by stage and name (the stage's first, had
-- a project renamed one), without touching when each was last updated.
alter table creatives drop constraint if exists creatives_status_id_fkey;
alter table creatives disable trigger creatives_stamp_update;
update creatives cr
set status_id = coalesce(
  (select n.id from project_statuses o join stage_statuses n
     on n.stage = o.stage and lower(trim(n.label)) = lower(trim(o.label))
   where o.id = cr.status_id and n.agency_id = cr.agency_id and n.client_id is null
   order by n.position
   limit 1),
  first_stage_status(cr.project_id, cr.stage::smallint))
where cr.status_id is not null;
alter table creatives enable trigger creatives_stamp_update;
alter table creatives add constraint creatives_status_id_fkey
  foreign key (status_id) references stage_statuses (id) on delete set null;

-- Projects no longer have their own.
drop trigger if exists projects_seed_statuses on projects;
drop function if exists projects_seed_statuses();
drop function if exists seed_project_statuses(uuid);
drop table project_statuses;
drop function if exists project_statuses_before_delete();
drop function if exists first_project_status(uuid, smallint);

-- From the table (phase125): a status in any stage now.
create or replace function set_creative_stage(p_creative_id uuid, p_stage int, p_status_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v creatives%rowtype;
begin
  select * into v from creatives where id = p_creative_id;
  if not found then
    raise exception 'This post no longer exists';
  end if;
  if not is_agency_staff(v.agency_id) or not exists (
    select 1 from projects
    where id = v.project_id and client_id in (select staff_visible_client_ids(v.agency_id))
  ) then
    raise exception 'not permitted';
  end if;
  if p_stage not between 1 and 6 then
    raise exception 'unknown stage: %', p_stage;
  end if;
  if v.stage = 1 and p_stage > 1 then
    raise exception 'Approve the Concept first';
  end if;

  if p_stage <> v.stage then
    if p_stage in (1, 2) then
      update creatives
      set stage = p_stage, approved_at = null, approved_by_name = null, approved_by_email = null
      where id = p_creative_id;
    else
      perform advance_creative_stage(p_creative_id, case p_stage
        when 3 then 'to_internal' when 4 then 'to_review' when 5 then 'to_approved' else 'to_live' end);
    end if;
  end if;

  -- What was picked: a status, or the stage alone.
  update creatives set status_id = p_status_id where id = p_creative_id and status_id is distinct from p_status_id;
end;
$$;

revoke all on function set_creative_stage(uuid, int, uuid) from public, anon;
grant execute on function set_creative_stage(uuid, int, uuid) to authenticated;

-- phase143's counts and feed, reading the new table.
create or replace function creative_stage_counts()
returns table (stage integer, exception text, n bigint)
language sql security invoker stable set search_path = public, extensions as $$
  select c.stage, c.exception::text, count(*)
  from creatives c
  where c.archived_at is null
    and not exists (select 1 from stage_statuses s where s.id = c.status_id and s.hides_post)
  group by c.stage, c.exception;
$$;

create or replace function client_list_stats()
returns table (client_id uuid, active_projects bigint, last_activity timestamptz)
language sql security invoker stable set search_path = public, extensions as $$
  select cl.id,
    count(distinct p.id),
    max(cr.created_at)
  from clients cl
  left join projects p on p.client_id = cl.id and p.archived_at is null
  left join creatives cr on cr.project_id = p.id and cr.archived_at is null
    and not exists (select 1 from stage_statuses s where s.id = cr.status_id and s.hides_post)
  group by cl.id;
$$;

revoke execute on function creative_stage_counts() from public, anon;
revoke execute on function client_list_stats() from public, anon;
grant execute on function creative_stage_counts() to authenticated;
grant execute on function client_list_stats() to authenticated;

create or replace function get_shared_review_feed(p_token text, p_passcode text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_link shared_links%rowtype;
  v_allowed_ids uuid[];
  v_others boolean;
  v_feed jsonb;
begin
  select * into v_link from shared_links where token = p_token and revoked_at is null;

  if not found or (v_link.expires_at is not null and v_link.expires_at <= now()) then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_link.requires_passcode then
    if p_passcode is null or p_passcode = '' then
      return jsonb_build_object('status', 'passcode_required');
    end if;
    if crypt(p_passcode, v_link.passcode_hash) <> v_link.passcode_hash then
      return jsonb_build_object('status', 'passcode_required', 'invalid', true);
    end if;
  end if;

  v_allowed_ids := coalesce(shared_link_allowed_creative_ids(v_link), '{}');
  select coalesce(cp.feed_shows_other_posts, true) into v_others
    from projects p left join client_preferences cp on cp.client_id = p.client_id
    where p.id = v_link.project_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', case when cr.id = any(v_allowed_ids) then cr.id end,
    'name', case when not (cr.id = any(v_allowed_ids)) and cr.stage <= 3 then cr.name end,
    'stage', cr.stage,
    'reel', 'ig_reel' = any(case when cardinality(cr.formats) > 0 then cr.formats else array[cr.format] end)
  ) order by coalesce(cr.scheduled_at, coalesce(cr.publish_on, cr.due_on)::timestamptz) desc nulls first, cr.position), '[]'::jsonb)
  into v_feed
  from creatives cr
  where cr.project_id = v_link.project_id and cr.archived_at is null
    and not exists (select 1 from stage_statuses s where s.id = cr.status_id and s.hides_post)
    and (coalesce(v_others, true) or cr.id = any(v_allowed_ids));

  return jsonb_build_object('status', 'ok', 'feed', v_feed);
end;
$$;
grant execute on function get_shared_review_feed(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
