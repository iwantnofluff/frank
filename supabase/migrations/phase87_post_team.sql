-- Phase 87 — a post's Team: several people, not one Lead.
--
-- Decided directly (10 Oct 2026): with the Lead column renamed Team
-- (phase85), a post can have several people from the team on it, picked
-- in the New Post window, the post's brief and the table's quick-add row.
--
-- Stored as a list on the post (team_user_ids), in the order picked. The
-- first is kept in lead_user_id by the database, so anything that reads
-- one person (analytics, older code) still works, and a page still open on
-- the version before this one, writing only lead_user_id, still saves:
-- the list follows it. Existing leads carry over as one-person teams.
--
-- Only the agency's own team can be on a post (not its clients), each
-- once; anyone else is refused rather than dropped, so a bad write
-- surfaces. Someone removed from the agency later stays listed on old
-- posts, as lead_user_id always did.

alter table creatives add column if not exists team_user_ids uuid[] not null default '{}';

update creatives set team_user_ids = array[lead_user_id]
  where lead_user_id is not null and team_user_ids = '{}';

create or replace function creatives_sync_team()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_ids uuid[];
begin
  -- A write that only changed lead_user_id (a page from before this
  -- version): the team follows it.
  if tg_op = 'UPDATE'
     and new.team_user_ids is not distinct from old.team_user_ids
     and new.lead_user_id is distinct from old.lead_user_id then
    new.team_user_ids := case when new.lead_user_id is null then '{}'::uuid[] else array[new.lead_user_id] end;
  elsif tg_op = 'INSERT' and new.team_user_ids = '{}' and new.lead_user_id is not null then
    new.team_user_ids := array[new.lead_user_id];
  end if;

  -- Each person once, in the order picked, no blanks.
  select coalesce(array_agg(id order by first_at), '{}') into v_ids
  from (
    select id, min(ord) as first_at
    from unnest(new.team_user_ids) with ordinality as t(id, ord)
    where id is not null
    group by id
  ) s;
  new.team_user_ids := v_ids;

  if array_length(new.team_user_ids, 1) > 20 then
    raise exception 'A post can have up to 20 people on its team' using errcode = '23514';
  end if;

  -- Only changes are checked, so an old post keeps someone who's since left.
  if tg_op = 'INSERT' or new.team_user_ids is distinct from old.team_user_ids then
    if exists (
      select 1 from unnest(new.team_user_ids) as t(id)
      where (tg_op = 'INSERT' or not (t.id = any (old.team_user_ids)))
        and not exists (
          select 1 from memberships m
          where m.user_id = t.id and m.agency_id = new.agency_id and m.client_id is null
            and m.removed_at is null
        )
    ) then
      raise exception 'Only people on the agency''s team can be on a post' using errcode = '23514';
    end if;
  end if;

  new.lead_user_id := new.team_user_ids[1];
  return new;
end;
$$;

-- After creatives_set_agency_id (it fills agency_id on insert), which runs
-- first by name.
drop trigger if exists creatives_sync_team on creatives;
create trigger creatives_sync_team
  before insert or update of team_user_ids, lead_user_id, agency_id on creatives
  for each row execute function creatives_sync_team();

-- The Activity Log names a change to the team as "Team" (it said "Lead").
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
  if new.team_user_ids is distinct from old.team_user_ids then v_fields := array_append(v_fields, 'Team'); end if;
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

-- A client's comments and approvals go to the post's whole team when the
-- client's chosen "the post's team" (stored as 'lead', its old name);
-- a post with nobody on it still goes to everyone on the client.
create or replace function client_activity_recipients(p_creative_id uuid, p_who text)
returns setof uuid
language sql stable security definer set search_path = public, extensions as $$
  with post as (
    select c.agency_id, c.project_id, c.team_user_ids, p.client_id
    from creatives c join projects p on p.id = c.project_id
    where c.id = p_creative_id
  ),
  team as (
    -- On the team, joined, still here, and able to see this post: Owners
    -- and Admins see every client; a User only the projects they're on.
    select m.user_id, m.role
    from memberships m, post
    where m.agency_id = post.agency_id and m.client_id is null
      and m.removed_at is null and m.accepted_at is not null
      and (
        m.role in ('primary_owner', 'owner', 'admin')
        or exists (select 1 from project_access pa where pa.membership_id = m.id and pa.project_id = post.project_id)
      )
  ),
  lead as (
    select team.user_id from team, post where p_who = 'lead' and team.user_id = any (post.team_user_ids)
  )
  select user_id from lead
  union
  select user_id from team
  where p_who = 'everyone' or (p_who = 'lead' and not exists (select 1 from lead))
  union
  select user_id from team
  where p_who = 'admins' and role in ('primary_owner', 'owner', 'admin');
$$;
revoke execute on function client_activity_recipients(uuid, text) from public, anon, authenticated;

notify pgrst, 'reload schema';
