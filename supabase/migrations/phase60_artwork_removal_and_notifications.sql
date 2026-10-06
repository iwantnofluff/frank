-- Phase 60 — artwork removed after a post has gone live, and notifications.
--
-- Decided directly (6 Oct 2026):
-- - An Approved post's artwork (every version's files and slides) is
--   removed 7 days after its live date. The post, its copy and every comment
--   stay. Posts still in review keep theirs, whatever their date.
-- - An Approved post with no live date (Other Content) isn't removed
--   automatically: 7 days after its due date (or its approval, with no due
--   date either), the agency's Owners and Admins are notified, and remove it
--   or keep it from a window. Keep is for good.
-- - The bell comes back for those notifications.
-- - Uploads can be up to 200MB a file (Supabase's own project limit has to
--   allow it too; it's set in the dashboard, not here).
--
-- No signed-in role can delete storage objects, so the functions here
-- return the storage paths they freed and a route removes the files with
-- the service role (as phase33's clear-artwork does).

-- 1. Uploads: 200MB a file.
update storage.buckets set file_size_limit = 209715200 where id = 'assets';

-- 2. When a post's artwork was removed, and when someone chose to keep it.
alter table creatives add column artwork_removed_at timestamptz;
alter table creatives add column artwork_kept_at timestamptz;

-- 3. Notifications: one person's, about one thing. Written only by the
--    functions below; each person reads and marks their own.
create table notifications (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  kind text not null check (kind in ('artwork_removal')),
  creative_id uuid references creatives (id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id, kind, creative_id)
);
create index notifications_user_idx on notifications (user_id, created_at desc);

alter table notifications enable row level security;
create policy notifications_select on notifications
  for select using (user_id = auth.uid() and in_request_agency(agency_id));
create policy notifications_update on notifications
  for update using (user_id = auth.uid() and in_request_agency(agency_id))
  with check (user_id = auth.uid());
-- Reading, and marking read: nothing else from a session.
revoke all on notifications from anon, authenticated;
grant select, update (read_at) on notifications to authenticated;

-- 4. Takes a post's artwork away: every version keeps its row (comments
--    point at them) without its file, the slides go, and the files nothing
--    else uses are freed. Internal: callers check access first.
create or replace function strip_creative_artwork(p_creative_id uuid)
returns text[]
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_assets uuid[];
  v_keys text[];
begin
  select array_agg(distinct a) into v_assets from (
    select cv.asset_id as a from creative_versions cv
    where cv.creative_id = p_creative_id and cv.asset_id is not null
    union
    select s.asset_id from creative_version_slides s
    join creative_versions cv on cv.id = s.creative_version_id
    where cv.creative_id = p_creative_id
  ) x;

  delete from creative_version_slides s using creative_versions cv
  where cv.id = s.creative_version_id and cv.creative_id = p_creative_id;
  update creative_versions set asset_id = null
  where creative_id = p_creative_id and asset_id is not null;
  update creatives set artwork_removed_at = now() where id = p_creative_id;

  with freed as (
    delete from assets a
    where a.id = any(coalesce(v_assets, '{}'))
      and not exists (select 1 from creative_versions cv where cv.asset_id = a.id)
      and not exists (select 1 from creative_version_slides s where s.asset_id = a.id)
      and not exists (select 1 from knowledge_entries k where k.asset_id = a.id)
      and not exists (select 1 from agency_knowledge_entries k where k.asset_id = a.id)
      and not exists (select 1 from clients cl where cl.logo_asset_id = a.id)
      and not exists (select 1 from users u where u.avatar_asset_id = a.id)
      and not exists (select 1 from agency_settings st where st.logo_asset_id = a.id)
    returning a.storage_key
  )
  select coalesce(array_agg(storage_key), '{}') into v_keys from freed;

  -- Nothing left to decide about it.
  delete from notifications where kind = 'artwork_removal' and creative_id = p_creative_id;
  return v_keys;
end;
$$;
revoke execute on function strip_creative_artwork(uuid) from public, anon, authenticated;

-- Whether a post still has any artwork to take away.
create or replace function creative_has_artwork(p_creative_id uuid)
returns boolean
language sql stable set search_path = public, extensions as $$
  select exists (
    select 1 from creative_versions cv
    where cv.creative_id = p_creative_id
      and (cv.asset_id is not null
        or exists (select 1 from creative_version_slides s where s.creative_version_id = cv.id))
  );
$$;

-- 5. The daily run (the service role only, from the cron route): removes
--    what's due, notifies about what's waiting on a decision, and returns
--    the storage paths to delete.
create or replace function run_artwork_housekeeping()
returns text[]
language plpgsql security definer set search_path = public, extensions as $$
declare
  r record;
  v_keys text[] := '{}';
begin
  -- Approved, live more than 7 days ago, artwork still there.
  for r in
    select c.id from creatives c
    where c.stage = 4
      and c.scheduled_at is not null
      and c.scheduled_at < now() - interval '7 days'
      and creative_has_artwork(c.id)
  loop
    v_keys := v_keys || strip_creative_artwork(r.id);
  end loop;

  -- Approved with no live date, 7 days past the due date (or the approval),
  -- not kept: each Owner and Admin of the agency is told, once.
  insert into notifications (agency_id, user_id, kind, creative_id)
  select c.agency_id, m.user_id, 'artwork_removal', c.id
  from creatives c
  join memberships m on m.agency_id = c.agency_id
    and m.client_id is null and m.removed_at is null and m.accepted_at is not null
    and m.role in ('primary_owner', 'owner', 'admin')
  where c.stage = 4
    and c.scheduled_at is null
    and c.artwork_kept_at is null
    and coalesce(c.due_on::timestamptz, c.approved_at) < now() - interval '7 days'
    and creative_has_artwork(c.id)
  on conflict (user_id, kind, creative_id) do nothing;

  return v_keys;
end;
$$;
revoke execute on function run_artwork_housekeeping() from public, anon, authenticated;

-- 6. From the notification's window: an Owner or Admin removes the
--    artwork now, or keeps it for good.
create or replace function remove_creative_artwork_now(p_creative_id uuid)
returns text[]
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_agency uuid;
begin
  select agency_id into v_agency from creatives where id = p_creative_id;
  if v_agency is null then
    raise exception 'post not found';
  end if;
  if coalesce(my_rank(v_agency), 99) > 2 then
    raise exception 'not permitted';
  end if;
  return strip_creative_artwork(p_creative_id);
end;
$$;
revoke execute on function remove_creative_artwork_now(uuid) from public, anon;
grant execute on function remove_creative_artwork_now(uuid) to authenticated;

create or replace function keep_creative_artwork(p_creative_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_agency uuid;
begin
  select agency_id into v_agency from creatives where id = p_creative_id;
  if v_agency is null then
    raise exception 'post not found';
  end if;
  if coalesce(my_rank(v_agency), 99) > 2 then
    raise exception 'not permitted';
  end if;
  update creatives set artwork_kept_at = now() where id = p_creative_id;
  delete from notifications where kind = 'artwork_removal' and creative_id = p_creative_id;
end;
$$;
revoke execute on function keep_creative_artwork(uuid) from public, anon;
grant execute on function keep_creative_artwork(uuid) to authenticated;
