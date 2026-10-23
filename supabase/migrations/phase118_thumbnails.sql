-- Phase 118 — a video post's thumbnail, in versions, and its Text on Image.
--
-- Decided directly (23 Oct 2026): video posts (Reels, YouTube, video
-- Stories and the other video formats) get a Thumbnail on the Content tab,
-- after Creative: one image, saved as V1, V2 and so on, and the words on
-- it, Thumbnail Text on Image, kept on the post as Text on Image is. The
-- team and the post's client see it, as they see the artwork. Uploading
-- one doesn't move the post's stage. It goes with the artwork after a
-- post goes live.

create table thumbnail_versions (
  id uuid primary key default gen_random_uuid(),
  creative_id uuid not null references creatives (id) on delete cascade,
  agency_id uuid not null references agencies (id),
  version_no integer not null check (version_no >= 1),
  -- Null once removed with the artwork after going live.
  asset_id uuid references assets (id) on delete set null,
  created_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  unique (creative_id, version_no)
);

create trigger thumbnail_versions_set_agency_id
  before insert or update of creative_id on thumbnail_versions
  for each row execute function set_agency_id_from_creative();
create trigger zz_read_only_guard before insert or update or delete on thumbnail_versions
  for each row execute function block_writes_when_read_only();

alter table thumbnail_versions enable row level security;
-- Whoever sees the post, as creative_versions_select (phase105).
create policy thumbnail_versions_select on thumbnail_versions
  for select using (
    agency_id in (select current_agency_ids())
    and creative_id in (select my_visible_creative_ids())
  );
-- The post's team, as themselves.
create policy thumbnail_versions_insert on thumbnail_versions
  for insert with check (can_see_creative_as_staff(creative_id) and created_by = auth.uid());

-- The words on the thumbnail, on the post itself.
alter table creatives
  add column if not exists thumbnail_text text check (char_length(thumbnail_text) <= 2000);

-- A client's people read their posts' thumbnails as they read the artwork.
alter policy assets_select on assets using (
  agency_id in (select current_agency_ids())
  and (
    agency_id in (select my_staff_agency_ids())
    or id in (select v.asset_id from creative_versions v where v.creative_id in (select my_client_creative_ids()))
    or id in (
      select s.asset_id from creative_version_slides s
      join creative_versions cv on cv.id = s.creative_version_id
      where cv.creative_id in (select my_client_creative_ids())
    )
    or id in (select t.asset_id from thumbnail_versions t where t.creative_id in (select my_client_creative_ids()))
    or id in (select cl.logo_asset_id from clients cl where cl.id in (select my_client_ids()))
    or id in (select k.asset_id from knowledge_entries k where k.client_id in (select my_client_ids()))
    or exists (select 1 from users where users.avatar_asset_id = assets.id)
    or exists (
      select 1 from agency_settings
      where agency_settings.logo_asset_id = assets.id and agency_settings.agency_id = assets.agency_id
    )
  )
);

-- The artwork's removal after going live (phase60) takes the thumbnails
-- too: their rows stay, without their files.
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
    union
    select t.asset_id from thumbnail_versions t
    where t.creative_id = p_creative_id and t.asset_id is not null
  ) x;

  delete from creative_version_slides s using creative_versions cv
  where cv.id = s.creative_version_id and cv.creative_id = p_creative_id;
  update creative_versions set asset_id = null
  where creative_id = p_creative_id and asset_id is not null;
  update thumbnail_versions set asset_id = null
  where creative_id = p_creative_id and asset_id is not null;
  update creatives set artwork_removed_at = now() where id = p_creative_id;

  with freed as (
    delete from assets a
    where a.id = any(coalesce(v_assets, '{}'))
      and not exists (select 1 from creative_versions cv where cv.asset_id = a.id)
      and not exists (select 1 from creative_version_slides s where s.asset_id = a.id)
      and not exists (select 1 from thumbnail_versions t where t.asset_id = a.id)
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

-- Whether a post still has any artwork (or a thumbnail) to take away.
create or replace function creative_has_artwork(p_creative_id uuid)
returns boolean
language sql stable set search_path = public, extensions as $$
  select exists (
    select 1 from creative_versions cv
    where cv.creative_id = p_creative_id
      and (cv.asset_id is not null
        or exists (select 1 from creative_version_slides s where s.creative_version_id = cv.id))
  ) or exists (
    select 1 from thumbnail_versions t where t.creative_id = p_creative_id and t.asset_id is not null
  );
$$;

-- So the API sees the new table and column straight away.
notify pgrst, 'reload schema';
