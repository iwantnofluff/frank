-- Phase 80 — telling the team when a client comments or approves.
--
-- Decided directly (9 Oct 2026): each client's Preferences say whether the
-- team hears in Frank (the bell), by email, and who hears: the post's lead
-- (or, with no lead, everyone on the client), everyone on the client, or
-- Owners and Admins (decided directly: the person setting it up decides).
--
-- The database writes a notice whenever the client's side comments on a
-- post (a guest on a review link, or one of the client's own people) or
-- approves one (an approval whose email is on the client's list; review
-- links allow no one else since phase77), so none is missed however it
-- happened. A notice wanted by email is marked so; the app sends it
-- straight after (/api/notify/client-activity) and records when.

-- 1. The client's choices. Email starts off, so nobody gets mail they
--    didn't ask for; the bell starts on.
alter table client_preferences
  add column if not exists notify_in_app boolean not null default true,
  add column if not exists notify_email boolean not null default false,
  add column if not exists notify_who text not null default 'lead'
    check (notify_who in ('lead', 'everyone', 'admins'));

-- 2. Notices about a client's comments and approvals beside the artwork
--    ones: which comment, whether it shows in the bell, whether it's owed
--    an email and when that went.
alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('artwork_removal', 'client_comment', 'client_approval'));
alter table notifications
  add column if not exists comment_id uuid references comments (id) on delete cascade,
  add column if not exists in_app boolean not null default true,
  add column if not exists email_due boolean not null default false,
  add column if not exists emailed_at timestamptz;

-- One artwork notice per person and post, as before; a post can have any
-- number of comment notices.
alter table notifications drop constraint if exists notifications_user_id_kind_creative_id_key;
create unique index if not exists notifications_one_artwork_notice
  on notifications (user_id, kind, creative_id) where kind = 'artwork_removal';
create unique index if not exists notifications_one_per_comment
  on notifications (user_id, comment_id) where comment_id is not null;
create index if not exists notifications_email_due_idx
  on notifications (created_at) where email_due and emailed_at is null;

-- phase70's run_artwork_housekeeping, its artwork notices kept to one per
-- person and post by the index above (the conflict target names it).
create or replace function run_artwork_housekeeping(p_agency_id uuid default null)
returns text[]
language plpgsql security definer set search_path = public, extensions as $$
declare
  r record;
  v_keys text[] := '{}';
begin
  -- Approved, live longer ago than the client keeps artwork, still there.
  for r in
    select c.id from creatives c
    join projects p on p.id = c.project_id
    left join client_preferences cp on cp.client_id = p.client_id
    where c.stage = 4
      and c.scheduled_at is not null
      and c.scheduled_at < now() - make_interval(days => coalesce(cp.artwork_keep_days, 7))
      and creative_has_artwork(c.id)
      and (p_agency_id is null or c.agency_id = p_agency_id)
  loop
    v_keys := v_keys || strip_creative_artwork(r.id);
  end loop;

  -- Approved with no live date, as long past the due date (or the
  -- approval), not kept, at a client that chose to remove them: removed.
  for r in
    select c.id from creatives c
    join projects p on p.id = c.project_id
    join client_preferences cp on cp.client_id = p.client_id and cp.undated_artwork = 'remove'
    where c.stage = 4
      and c.scheduled_at is null
      and c.artwork_kept_at is null
      and coalesce(c.due_on::timestamptz, c.approved_at) < now() - make_interval(days => cp.artwork_keep_days)
      and creative_has_artwork(c.id)
      and (p_agency_id is null or c.agency_id = p_agency_id)
  loop
    v_keys := v_keys || strip_creative_artwork(r.id);
  end loop;

  -- The same, at a client that asks (the default): each Owner and Admin of
  -- the agency is told, once.
  insert into notifications (agency_id, user_id, kind, creative_id)
  select c.agency_id, m.user_id, 'artwork_removal', c.id
  from creatives c
  join projects p on p.id = c.project_id
  left join client_preferences cp on cp.client_id = p.client_id
  join memberships m on m.agency_id = c.agency_id
    and m.client_id is null and m.removed_at is null and m.accepted_at is not null
    and m.role in ('primary_owner', 'owner', 'admin')
  where c.stage = 4
    and c.scheduled_at is null
    and c.artwork_kept_at is null
    and coalesce(cp.undated_artwork, 'ask') = 'ask'
    and coalesce(c.due_on::timestamptz, c.approved_at) < now() - make_interval(days => coalesce(cp.artwork_keep_days, 7))
    and creative_has_artwork(c.id)
    and (p_agency_id is null or c.agency_id = p_agency_id)
  on conflict (user_id, kind, creative_id) where kind = 'artwork_removal' do nothing;

  return v_keys;
end;
$$;
revoke execute on function run_artwork_housekeeping(uuid) from public, anon, authenticated;

-- 3. Who on the team hears about a post, by the client's choice.
create or replace function client_activity_recipients(p_creative_id uuid, p_who text)
returns setof uuid
language sql stable security definer set search_path = public, extensions as $$
  with post as (
    select c.agency_id, c.project_id, c.lead_user_id, p.client_id
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
    select team.user_id from team, post where p_who = 'lead' and team.user_id = post.lead_user_id
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

-- Writes the notices for one piece of client activity, by the client's
-- Preferences; nothing when both the bell and email are off.
create or replace function notify_client_activity(p_creative_id uuid, p_kind text, p_comment_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_in_app boolean;
  v_email boolean;
  v_who text;
  v_agency uuid;
begin
  select coalesce(cp.notify_in_app, true), coalesce(cp.notify_email, false), coalesce(cp.notify_who, 'lead'), c.agency_id
    into v_in_app, v_email, v_who, v_agency
  from creatives c
  join projects p on p.id = c.project_id
  left join client_preferences cp on cp.client_id = p.client_id
  where c.id = p_creative_id;
  if v_agency is null or not (v_in_app or v_email) then return; end if;

  insert into notifications (agency_id, user_id, kind, creative_id, comment_id, in_app, email_due)
  select v_agency, r, p_kind, p_creative_id, p_comment_id, v_in_app, v_email
  from client_activity_recipients(p_creative_id, v_who) r
  on conflict do nothing;
end;
$$;
revoke execute on function notify_client_activity(uuid, text, uuid) from public, anon, authenticated;

-- 4. A comment from the client's side: a guest on a review link, or one of
--    the client's own people. Review links' own approval note isn't one
--    (the approval is told instead).
create or replace function comments_notify_client_activity()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.author_id is null then
    if new.body = 'Approved via shared review link.' then return new; end if;
  elsif not exists (
    select 1 from memberships m
    where m.agency_id = new.agency_id and m.user_id = new.author_id and m.client_id is not null
  ) then
    return new;
  end if;
  perform notify_client_activity(new.creative_id, 'client_comment', new.id);
  return new;
end;
$$;
drop trigger if exists comments_notify_client_activity on comments;
create trigger comments_notify_client_activity
  after insert on comments
  for each row execute function comments_notify_client_activity();

-- 5. An approval by the client: approved by someone on the client's list.
create or replace function creatives_notify_client_approval()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.stage = 4 and new.approved_at is not null
     and new.approved_at is distinct from old.approved_at
     and new.approved_by_email is not null
     and exists (
       select 1 from projects p join client_contacts cc on cc.client_id = p.client_id
       where p.id = new.project_id and cc.archived_at is null
         and lower(cc.email) = lower(new.approved_by_email)
     ) then
    perform notify_client_activity(new.id, 'client_approval', null);
  end if;
  return new;
end;
$$;
drop trigger if exists creatives_notify_client_approval on creatives;
create trigger creatives_notify_client_approval
  after update of approved_at on creatives
  for each row execute function creatives_notify_client_approval();
